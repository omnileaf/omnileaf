import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import { resolvedColour } from "../../../../../tests/components/resolved-colour";

import { cn } from "#lib/components/cn.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { TABS_LOOKS } from "./looks.ts";
import TabsHarness from "./TabsHarness.svelte";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;

interface TabsDrawn {
  readonly listHeight: number;
  readonly listCorner: string;
  readonly listFill: string;
  readonly listIsHugged: boolean;
  readonly triggerCorner: string;
  readonly chosenFill: string;
  readonly chosenWeight: string;
  readonly otherFill: string;
  readonly otherWeight: string;
  readonly labelSize: string;
}

async function tabsOn(
  platform: "linux" | "macos" | "ios",
  theme: string,
): Promise<TabsDrawn> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  await render(TabsHarness);
  const list = page.getByRole("tablist").element();
  const chosen = page.getByRole("tab").nth(0).element();
  const other = page.getByRole("tab").nth(1).element();
  const listStyle = getComputedStyle(list);
  return {
    listHeight: list.getBoundingClientRect().height,
    listCorner: listStyle.borderTopLeftRadius,
    listFill: listStyle.backgroundColor,
    listIsHugged:
      list.getBoundingClientRect().width <
      (list.parentElement?.getBoundingClientRect().width ?? 0),
    triggerCorner: getComputedStyle(chosen).borderTopLeftRadius,
    chosenFill: getComputedStyle(chosen).backgroundColor,
    chosenWeight: getComputedStyle(chosen).fontWeight,
    otherFill: getComputedStyle(other).backgroundColor,
    otherWeight: getComputedStyle(other).fontWeight,
    labelSize: getComputedStyle(chosen).fontSize,
  };
}

beforeEach(async () => {
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("keeps every class of every look through the class merge", () => {
  const looks = Object.values(TABS_LOOKS).flatMap(({ list, trigger }) => [
    list,
    trigger,
  ]);

  expect(looks.map((classes) => cn(classes))).toEqual(looks);
});

test("draws linux's tabs as shadcn's, a muted track hugging raised triggers", async () => {
  const drawn = await tabsOn("linux", "light");

  expect(drawn).toEqual({
    listHeight: 36,
    listCorner: "10px",
    listFill: resolvedColour("--muted", "backgroundColor"),
    listIsHugged: true,
    triggerCorner: "8px",
    chosenFill: resolvedColour("--raised", "backgroundColor"),
    chosenWeight: "600",
    otherFill: "rgba(0, 0, 0, 0)",
    otherWeight: "500",
    labelSize: "14px",
  });
});

test("keeps a linux tab's width when it is chosen", async () => {
  followCorePlatform("linux");
  await render(TabsHarness);
  const chapters = page.getByRole("tab").nth(1);
  const widthBefore = chapters.element().getBoundingClientRect().width;

  await chapters.click();

  await expect.element(chapters).toHaveAttribute("aria-selected", "true");
  expect(chapters.element().getBoundingClientRect().width).toBe(widthBefore);
});

test("raises linux's chosen tab off the muted track in the dark theme", async () => {
  const drawn = await tabsOn("linux", "dark");

  expect([drawn.listFill, drawn.chosenFill]).toEqual([
    resolvedColour("--muted", "backgroundColor"),
    resolvedColour("--raised", "backgroundColor"),
  ]);
});

async function triggerInksOn(theme: string): Promise<{
  readonly chosenInk: string;
  readonly otherInk: string;
  readonly chosenEdge: string;
}> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("linux");
  await render(TabsHarness);
  const chosen = getComputedStyle(page.getByRole("tab").nth(0).element());
  return {
    chosenInk: chosen.color,
    otherInk: getComputedStyle(page.getByRole("tab").nth(1).element()).color,
    chosenEdge: chosen.borderTopColor,
  };
}

test("mutes linux's other tabs and edges the chosen one in the dark theme", async () => {
  const inks = await triggerInksOn("dark");

  expect(inks).toEqual({
    chosenInk: resolvedColour("--foreground", "color"),
    otherInk: resolvedColour("--secondary-text", "color"),
    chosenEdge: resolvedColour("--input", "color"),
  });
});

test("keeps linux's other tabs in the foreground ink with no chosen edge in the light theme", async () => {
  const inks = await triggerInksOn("light");

  expect(inks).toEqual({
    chosenInk: resolvedColour("--foreground", "color"),
    otherInk: resolvedColour("--foreground", "color"),
    chosenEdge: "rgba(0, 0, 0, 0)",
  });
});

test("keeps the tabs as they were on macOS", async () => {
  const drawn = await tabsOn("macos", "light");

  expect([drawn.listIsHugged, drawn.triggerCorner, drawn.labelSize]).toEqual([
    false,
    "10px",
    "15px",
  ]);
});

test("draws iOS's tabs as a segmented control, a capsule track with a raised pill under the chosen one", async () => {
  const drawn = await tabsOn("ios", "light");

  expect(drawn.listHeight).toBeCloseTo(32, 0);
  expect(drawn.listFill).toBe("rgba(118, 118, 128, 0.12)");
  expect(drawn.chosenFill).toBe("rgb(255, 255, 255)");
  expect(drawn.chosenWeight).toBe("590");
  expect(drawn.labelSize).toBe("13px");
});
