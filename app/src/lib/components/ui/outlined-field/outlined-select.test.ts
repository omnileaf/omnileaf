import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import OutlinedSelectHarness from "./OutlinedSelectHarness.svelte";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("marks keyboard focus with the accent outline alone and no second ring", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
  await page.viewport(400, 800);
  await render(OutlinedSelectHarness);
  const select = page.getByRole("combobox").element();

  await userEvent.tab();

  expect(document.activeElement).toBe(select);
  expect(getComputedStyle(select).outlineStyle).toBe("none");
  expect(getComputedStyle(select).borderTopColor).toBe(
    resolvedColour("--color-accent", "backgroundColor"),
  );
});
