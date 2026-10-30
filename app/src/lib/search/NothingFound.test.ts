import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import NothingFound from "./NothingFound.svelte";

const PHONE = { width: 390, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function nothingFoundOn(
  platform: "ios" | "linux",
  size: { width: number; height: number },
  suggestion = "harbour gate",
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(NothingFound, {
    text: "harbor gat",
    suggestion: { text: suggestion, chapterOf: null },
    onSuggest: () => undefined,
  });
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the screen drew no element");
  }
  return element;
}

test("sets the title in 22 point semibold and the hint in 22 point medium muted type on an iPhone", async () => {
  await nothingFoundOn("ios", PHONE);

  const title = getComputedStyle(
    asElement(page.getByRole("heading").element()),
  );
  const hint = getComputedStyle(
    asElement(page.getByText(/^Did you mean/).element()),
  );

  expect({
    titleSize: title.fontSize,
    titleWeight: title.fontWeight,
    hintSize: hint.fontSize,
    hintWeight: hint.fontWeight,
    hintInk: hint.color,
  }).toEqual({
    titleSize: "22px",
    titleWeight: "590",
    hintSize: "22px",
    hintWeight: "510",
    hintInk: resolvedColour("--color-muted", "color"),
  });
});

test("draws a bare 41 point accent search icon without its tile on an iPhone", async () => {
  await nothingFoundOn("ios", PHONE);

  const media = asElement(
    document.querySelector("[data-slot=empty-media]") ?? document.body,
  );
  const icon = media.querySelector("svg");

  expect(icon?.getBoundingClientRect().width).toBe(41);
  expect(getComputedStyle(media).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(media).color).toBe(
    resolvedColour("--color-accent", "color"),
  );
});

test("underlines the suggestion in the accent colour on an iPhone", async () => {
  await nothingFoundOn("ios", PHONE);

  const suggestion = getComputedStyle(
    asElement(page.getByRole("button", { name: "harbour gate" }).element()),
  );

  expect({
    line: suggestion.textDecorationLine,
    ink: suggestion.color,
  }).toEqual({
    line: "underline",
    ink: resolvedColour("--color-accent", "color"),
  });
});

test("keeps the art tile and today's type on an iPad and Linux", async () => {
  await nothingFoundOn("ios", TABLET);
  const onIpad = getComputedStyle(
    asElement(
      document.querySelector("[data-slot=empty-media]") ?? document.body,
    ),
  ).backgroundColor;
  document.body.replaceChildren();
  await nothingFoundOn("linux", PHONE);
  const onLinux = getComputedStyle(
    asElement(
      document.querySelector("[data-slot=empty-media]") ?? document.body,
    ),
  ).backgroundColor;

  expect(onIpad).not.toBe("rgba(0, 0, 0, 0)");
  expect(onLinux).not.toBe("rgba(0, 0, 0, 0)");
  expect(
    getComputedStyle(asElement(page.getByRole("heading").element())).fontWeight,
  ).not.toBe("590");
});

test("wraps a long suggestion inside the screen on an iPhone", async () => {
  await nothingFoundOn(
    "ios",
    PHONE,
    "the harbour gate keeper's long winter at the lighthouse",
  );

  const link = asElement(
    page
      .getByRole("button", {
        name: "the harbour gate keeper's long winter at the lighthouse",
      })
      .element(),
  );

  expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(PHONE.width);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(PHONE.width);
});
