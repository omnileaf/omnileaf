import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesBarHarness from "./SeriesBarHarness.svelte";

const PHONE = { width: 400, height: 800 } as const;
const TABLET = { width: 768, height: 1024 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function barOn(
  platform: Platform,
  isTitleUnderBar: boolean,
  viewport: { width: number; height: number } = PHONE,
) {
  await page.viewport(viewport.width, viewport.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(SeriesBarHarness, { isTitleUnderBar });
  const chips = [
    page.getByRole("link", { name: "Back to the library" }).element(),
    page.getByRole("button", { name: /^More/ }).element(),
  ];
  return chips.map((chip) => {
    const style = getComputedStyle(chip);
    const box = chip.getBoundingClientRect();
    return {
      size: [box.width, box.height],
      fill: style.backgroundColor,
      ink: style.color,
      glyph: chip.querySelector("svg") === null ? "font" : "svg",
    };
  });
}

test("draws Android's series bar buttons as 40px tonal circles with a vertical more icon over the cover", async () => {
  const [back, more] = await barOn("android", false);

  expect([back?.size, back?.fill, back?.ink]).toEqual([
    [40, 40],
    "rgb(208, 232, 215)",
    "rgb(65, 87, 73)",
  ]);
  expect([more?.size, more?.fill, more?.glyph]).toEqual([
    [40, 40],
    "rgb(208, 232, 215)",
    "font",
  ]);
});

test("keeps Android's series bar buttons plain once the bar folds", async () => {
  const [back, more] = await barOn("android", true);

  expect([back?.fill, more?.fill]).toEqual([
    "rgba(0, 0, 0, 0)",
    "rgba(0, 0, 0, 0)",
  ]);
});

test("keeps an iPhone's series bar buttons as they were", async () => {
  const [back, more] = await barOn("ios", false);

  expect([back, more]).toEqual([
    {
      size: [44, 44],
      fill: "rgba(255, 255, 255, 0.7)",
      ink: "rgb(0, 0, 0)",
      glyph: "font",
    },
    {
      size: [44, 44],
      fill: "rgba(255, 255, 255, 0.7)",
      ink: "rgb(0, 0, 0)",
      glyph: "svg",
    },
  ]);
});

test("keeps an Android tablet's series bar buttons as they were", async () => {
  const [back, more] = await barOn("android", false, TABLET);

  expect([back?.fill, more?.fill, more?.glyph]).toEqual([
    "rgb(239, 245, 238)",
    "rgb(239, 245, 238)",
    "svg",
  ]);
});
