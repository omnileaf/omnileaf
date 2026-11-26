import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";
import { BLUE_WALLPAPER } from "../../../tests/sample-wallpaper";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { followContrast } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SettingsDividersHarness from "./SettingsDividersHarness.svelte";

const PHONE_WIDTH = 390;
const TABLET_WIDTH = 820;
const HEIGHT = 800;
const THEMES = ["light", "dark"] as const;
const RAISED_CONTRASTS = ["medium", "high"] as const;
const LINE = "1px";
const NO_LINE = "0px";
const GAP_ABOVE_LINE = 8;

async function settingsPage(
  platform: Platform,
  width: number,
  theme: (typeof THEMES)[number] = "light",
): Promise<void> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await page.viewport(width, HEIGHT);
  await render(SettingsDividersHarness);
}

function block(testId: string): HTMLElement {
  const element = page.getByTestId(testId).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`no block marked ${testId}`);
  }
  return element;
}

function lineAbove(testId: string): string {
  return getComputedStyle(block(testId)).borderTopWidth;
}

function showBlueWallpaper(): Promise<void> {
  return followWallpaperColours("android", "wallpaper", {
    wallpaperColours: () =>
      Promise.resolve({ status: "ok", data: BLUE_WALLPAPER }),
    accentColours: () => Promise.resolve(null),
  });
}

function expectLineInSettingsRule(testId: string): void {
  const rule = resolvedColour("--native-color-settings-rule", "color");

  const style = getComputedStyle(block(testId));

  expect(style.borderTopColor).toBe(rule);
  expect(style.borderImageSource).toBe(`linear-gradient(${rule}, ${rule})`);
}

afterEach(async () => {
  await followWallpaperColours("android", "omnileaf");
  delete document.documentElement.dataset.contrast;
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws no line above a page's first group, after its opening note", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("first-group");

  expect(line).toBe(NO_LINE);
});

for (const theme of THEMES) {
  test(`draws a 1px line in the settings rule colour 8px above a group that follows another group in the ${theme} theme`, async () => {
    await settingsPage("android", PHONE_WIDTH, theme);

    const style = getComputedStyle(block("second-group"));
    const gap =
      block("second-group").getBoundingClientRect().top -
      block("first-group").getBoundingClientRect().bottom;

    expect(style.borderTopWidth).toBe(LINE);
    expect(style.borderTopStyle).toBe("solid");
    expectLineInSettingsRule("second-group");
    expect(gap).toBeCloseTo(GAP_ABOVE_LINE, 1);
  });

  for (const contrast of RAISED_CONTRASTS) {
    test(`colours the line as the settings rule at ${contrast} Colour contrast in the ${theme} theme`, async () => {
      document.documentElement.dataset.contrast = contrast;

      await settingsPage("android", PHONE_WIDTH, theme);

      expectLineInSettingsRule("second-group");
    });
  }

  test(`colours the line as the settings rule with wallpaper Colours in the ${theme} theme`, async () => {
    await showBlueWallpaper();

    await settingsPage("android", PHONE_WIDTH, theme);

    expectLineInSettingsRule("second-group");
  });
}

function expectSettingsRuleToMatch(colour: string): void {
  const rule = resolvedColour("--native-color-settings-rule", "color");

  expect(rule).toBe(resolvedColour(colour, "color"));
}

for (const theme of THEMES) {
  for (const contrast of [undefined, ...RAISED_CONTRASTS]) {
    test(`gives the settings rule Android's menu rule colour at ${contrast ?? "default"} Colour contrast in the ${theme} theme`, () => {
      document.documentElement.dataset.theme = theme;
      followContrast(contrast);
      followCorePlatform("android");

      expectSettingsRuleToMatch("--native-color-menu-rule");
    });
  }

  test(`gives the settings rule Android's menu rule colour with wallpaper Colours in the ${theme} theme`, async () => {
    await showBlueWallpaper();
    document.documentElement.dataset.theme = theme;
    followCorePlatform("android");

    expectSettingsRuleToMatch("--native-color-menu-rule");
  });

  for (const platform of ["ios", "macos", "windows"] as const) {
    test(`gives the settings rule the border colour on ${platform} in the ${theme} theme`, () => {
      document.documentElement.dataset.theme = theme;
      followCorePlatform(platform);

      expectSettingsRuleToMatch("--border");
    });
  }
}

test("draws the line above a group wrapped in an unmarked block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("wrapped-group");

  expect(line).toBe(LINE);
});

test("draws the line above a group that follows a block holding a group", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("group-after-block-holding-group");

  expect(line).toBe(LINE);
});

test("draws the line above a group that follows a padded block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("group-after-end-only");

  expect(line).toBe(LINE);
});

test("never draws a line above a padded block or a footer", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const lines = [lineAbove("padded-block"), lineAbove("footer")];

  expect(lineAbove("group-after-padded-block")).toBe(LINE);
  expect(lines).toEqual([NO_LINE, NO_LINE]);
});

test("never draws a line inside a group", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const lines = [
    "first-inner-list",
    "second-inner-list",
    "inner-list-after-group",
  ].map(lineAbove);

  expect(lineAbove("second-group")).toBe(LINE);
  expect(lines).toEqual([NO_LINE, NO_LINE, NO_LINE]);
});

test("draws the line above a group that follows a block holding a padded block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const lines = [
    "group-after-block-holding-end",
    "wrapped-group-after-block-holding-end",
  ].map(lineAbove);

  expect(lines).toEqual([LINE, LINE]);
});

test("never draws a line above a group inside a padded block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const lines = [
    "group-inside-padded-block",
    "second-group-inside-padded-block",
  ].map(lineAbove);

  expect(lines).toEqual([NO_LINE, NO_LINE]);
});

test("draws no line above the first group when only an unmarked block comes before it", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("group-after-switch");

  expect(lineAbove("second-group")).toBe(LINE);
  expect(line).toBe(NO_LINE);
});

test("draws the phone's lines on an Android tablet", async () => {
  await settingsPage("android", TABLET_WIDTH);

  const lines = ["second-group", "group-after-end-only", "wrapped-group"].map(
    lineAbove,
  );

  expect(lines).toEqual([LINE, LINE, LINE]);
});

test("draws no lines on an iPhone", async () => {
  await settingsPage("ios", PHONE_WIDTH);

  const lines = ["second-group", "group-after-end-only", "wrapped-group"].map(
    lineAbove,
  );

  expect(lines).toEqual([NO_LINE, NO_LINE, NO_LINE]);
});
