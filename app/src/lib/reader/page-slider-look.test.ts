import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import PageSliderHarness from "./PageSliderHarness.svelte";

const PHONE = { width: 400, height: 800 };
const TABLET = { width: 820, height: 1180 };
const ROOT_HEIGHT = 44;
const TRACK_HEIGHT = 16;
const HANDLE = { width: 4, height: 44 };
const HANDLE_INSET = 6;
const SHOWN_INDEX = 3;
const PAGE_COUNT = 30;
const DESKTOP_TRACK_HEIGHT = 6;

async function openSlider(
  platform: Platform,
  viewport: { width: number; height: number },
  direction: "leftToRight" | "rightToLeft" = "leftToRight",
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(viewport.width, viewport.height);
  await render(PageSliderHarness, { platform, direction });
}

function part(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the slider drew no ${selector}`);
  }
  return element;
}

function track(): HTMLElement {
  return part("[data-progress-thumb]").previousElementSibling as HTMLElement;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws Android's slider 44 tall around a 16 tall track", async () => {
  await openSlider("android", PHONE);

  expect(part("[data-slider-root]").getBoundingClientRect().height).toBe(
    ROOT_HEIGHT,
  );
  expect(track().getBoundingClientRect().height).toBe(TRACK_HEIGHT);
});

test("draws Android's handle as a 4 by 44 bar at the page", async () => {
  await openSlider("android", PHONE);
  const root = part("[data-slider-root]").getBoundingClientRect();
  const handle = part("[data-progress-thumb]").getBoundingClientRect();
  const progress = SHOWN_INDEX / (PAGE_COUNT - 1);

  expect([handle.width, handle.height]).toEqual([HANDLE.width, HANDLE.height]);
  expect(handle.left + handle.width / 2).toBeCloseTo(
    root.left + HANDLE_INSET + progress * (root.width - 2 * HANDLE_INSET),
    0,
  );
  expect(getComputedStyle(part("[data-progress-thumb]")).backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("centres Android's handle on the page counted from the right when reading right to left", async () => {
  await openSlider("android", PHONE, "rightToLeft");
  const root = part("[data-slider-root]").getBoundingClientRect();
  const handle = part("[data-progress-thumb]").getBoundingClientRect();
  const progress = SHOWN_INDEX / (PAGE_COUNT - 1);

  expect(handle.left + handle.width / 2).toBeCloseTo(
    root.right - HANDLE_INSET - progress * (root.width - 2 * HANDLE_INSET),
    0,
  );
});

test("splits Android's track around the handle with a stop dot at its end", async () => {
  await openSlider("android", PHONE);
  const rest = getComputedStyle(track(), "::before");
  const fill = getComputedStyle(track().firstElementChild as Element);

  expect(rest.backgroundColor).toBe(
    resolvedColour("--native-color-tab-pill", "backgroundColor"),
  );
  expect(rest.backgroundImage).toContain("radial-gradient");
  expect(rest.clipPath).not.toBe("none");
  expect(fill.clipPath).not.toBe("none");
  expect(fill.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("keeps the thin track and round thumb on Android tablets and the desktops", async () => {
  await openSlider("android", TABLET);
  expect(track().getBoundingClientRect().height).toBe(DESKTOP_TRACK_HEIGHT);
  expect(part("[data-progress-thumb]").getBoundingClientRect().width).toBe(
    part("[data-progress-thumb]").getBoundingClientRect().height,
  );

  await openSlider("linux", PHONE);
  expect(track().getBoundingClientRect().height).toBe(DESKTOP_TRACK_HEIGHT);
});
