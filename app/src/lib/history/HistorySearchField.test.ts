import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import HistorySearchField from "./HistorySearchField.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const TRANSPARENT = "rgba(0, 0, 0, 0)";

async function fieldGroupOn(screen: {
  width: number;
  height: number;
}): Promise<HTMLElement> {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await page.viewport(screen.width, screen.height);
  await render(HistorySearchField, {
    text: "",
    platform: "android",
    look: "bar",
    onFind: () => undefined,
  });
  const group = page
    .getByRole("searchbox", { name: "Search History" })
    .element().parentElement;
  if (group === null) {
    throw new Error("the search field drew no group");
  }
  return group;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws the narrow History search as a flat bar on an Android phone", async () => {
  const group = await fieldGroupOn(PHONE);

  expect(getComputedStyle(group).backgroundColor).toBe(TRANSPARENT);
});

test("keeps an Android tablet's narrow History search as a filled field", async () => {
  const group = await fieldGroupOn(TABLET);

  expect(getComputedStyle(group).backgroundColor).toBe(
    resolvedColour("--color-well", "backgroundColor"),
  );
});
