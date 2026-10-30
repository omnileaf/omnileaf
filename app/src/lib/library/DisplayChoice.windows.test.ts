import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import DisplayChoice from "./DisplayChoice.svelte";

const DESKTOP = { width: 1280, height: 800 };
const SEGMENT_HEIGHT = 32;
const INDICATOR = { height: "3px", width: "16px" };

async function drawChoice(platform: Platform, theme: "light" | "dark") {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(DisplayChoice, { chosen: "grid", onChoose: () => undefined });
  return {
    track: page.getByRole("radiogroup").element(),
    chosen: page.getByRole("radio", { name: "Grid" }).element(),
    other: page.getByRole("radio", { name: "List" }).element(),
  };
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("sets the display choice as a Windows segmented control with a 1 stroke track, segments 1 apart and 32 tall", async () => {
  const { track, chosen } = await drawChoice("windows", "light");
  const style = getComputedStyle(track);

  expect([
    style.columnGap,
    style.borderTopWidth,
    style.borderTopLeftRadius,
    chosen.getBoundingClientRect().height,
  ]).toEqual(["1px", "1px", "4px", SEGMENT_HEIGHT]);
});

for (const theme of ["light", "dark"] as const) {
  test(`raises the chosen segment on the control fill with a 3 tall accent pill under its label in the ${theme} theme`, async () => {
    const { chosen, other } = await drawChoice("windows", theme);
    const pill = getComputedStyle(chosen, "::after");

    expect([
      pill.height,
      pill.width,
      pill.backgroundColor,
      getComputedStyle(chosen).backgroundColor,
      getComputedStyle(other).backgroundColor,
    ]).toEqual([
      INDICATOR.height,
      INDICATOR.width,
      resolvedColour("--native-color-button-primary", "backgroundColor"),
      resolvedColour("--native-color-segment-selected", "backgroundColor"),
      "rgba(0, 0, 0, 0)",
    ]);
  });
}

test("leaves Linux's display choice with no track stroke", async () => {
  const { track } = await drawChoice("linux", "light");

  expect(getComputedStyle(track).borderTopWidth).toBe("0px");
});
