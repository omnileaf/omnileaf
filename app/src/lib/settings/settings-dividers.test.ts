import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SettingsDividersHarness from "./SettingsDividersHarness.svelte";

const PHONE_WIDTH = 390;
const TABLET_WIDTH = 820;
const HEIGHT = 800;
const THEMES = ["light", "dark"] as const;
const LINE = "1px";
const NO_LINE = "0px";
const GAP_ABOVE_LINE = 8;

async function settingsPage(
  platform: Platform,
  width: number,
  theme = "light",
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

afterEach(() => {
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
  test(`draws a 1px line in the separator colour 8px above a group that follows another group in the ${theme} theme`, async () => {
    await settingsPage("android", PHONE_WIDTH, theme);

    const style = getComputedStyle(block("second-group"));
    const gap =
      block("second-group").getBoundingClientRect().top -
      block("first-group").getBoundingClientRect().bottom;

    expect(style.borderTopWidth).toBe(LINE);
    expect(style.borderTopStyle).toBe("solid");
    expect(style.borderTopColor).toBe(
      resolvedColour("--color-border", "color"),
    );
    expect(gap).toBeCloseTo(GAP_ABOVE_LINE, 1);
  });
}

test("draws the line above a group wrapped in an unmarked block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("wrapped-group");

  expect(line).toBe(LINE);
});

test("draws the line above a group that follows a padded block", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("group-after-padded-block");

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

  const lines = [lineAbove("first-inner-list"), lineAbove("second-inner-list")];

  expect(lineAbove("second-group")).toBe(LINE);
  expect(lines).toEqual([NO_LINE, NO_LINE]);
});

test("draws no line above the first group when only an unmarked block comes before it", async () => {
  await settingsPage("android", PHONE_WIDTH);

  const line = lineAbove("group-after-switch");

  expect(lineAbove("second-group")).toBe(LINE);
  expect(line).toBe(NO_LINE);
});

for (const [name, platform, width] of [
  ["an Android tablet", "android", TABLET_WIDTH],
  ["an iPhone", "ios", PHONE_WIDTH],
] as const) {
  test(`draws no lines on ${name}`, async () => {
    await settingsPage(platform, width);

    const lines = [
      "second-group",
      "group-after-padded-block",
      "wrapped-group",
    ].map(lineAbove);

    expect(lines).toEqual([NO_LINE, NO_LINE, NO_LINE]);
  });
}
