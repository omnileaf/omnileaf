import type { Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, FAKE_APP_VERSION, test } from "./fixtures.ts";

const BOTTOM_BAR_MAX_WIDTH = 600;
const STATUS_BAR = 59;
const HOME_INDICATOR = 34;
const FLOATING_BAR_GAP = 22;
const GESTURE_BAR = 24;

interface SafeAreaInsets {
  readonly top: number;
  readonly bottom: number;
}

async function emulateSafeArea(page: Page, insets: SafeAreaInsets) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets });
}

async function provideSystemInsets(page: Page, insets: SafeAreaInsets) {
  await page.evaluate(({ top, bottom }) => {
    const root = document.documentElement.style;
    root.setProperty("--system-inset-top", `${String(top)}px`);
    root.setProperty("--system-inset-bottom", `${String(bottom)}px`);
  }, insets);
}

function onPlatform(platform: Platform) {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => ({ version: FAKE_APP_VERSION, platform }),
    },
  };
}

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium can emulate safe areas");
});

test("keeps the page heading below the status bar", async ({ page }) => {
  await emulateSafeArea(page, { top: STATUS_BAR, bottom: HOME_INDICATOR });

  await page.goto("/");
  const heading = await page
    .getByRole("heading", { level: 1, name: "Library" })
    .boundingBox();

  expect(heading?.y).toBeGreaterThanOrEqual(STATUS_BAR);
});

test("keeps the rail and sidebar below the status bar", async ({ page }) => {
  await emulateSafeArea(page, { top: STATUS_BAR, bottom: HOME_INDICATOR });

  await page.goto("/");
  test.skip(
    (page.viewportSize()?.width ?? 0) < BOTTOM_BAR_MAX_WIDTH,
    "tablets and desktops only",
  );
  const firstLink = await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link")
    .first()
    .boundingBox();

  expect(firstLink?.y).toBeGreaterThanOrEqual(STATUS_BAR);
});

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("floats the bottom bar just above the home indicator", async ({
    page,
  }) => {
    await emulateSafeArea(page, { top: STATUS_BAR, bottom: HOME_INDICATOR });

    await page.goto("/");
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 0) >= BOTTOM_BAR_MAX_WIDTH, "phones only");
    const bar = await page
      .getByRole("navigation", { name: "Main" })
      .boundingBox();

    expect((viewport?.height ?? 0) - (bar?.y ?? 0) - (bar?.height ?? 0)).toBe(
      FLOATING_BAR_GAP,
    );
  });
});

test.describe("on Android", () => {
  test.use(onPlatform("android"));

  test("keeps the heading below the status bar the app reports", async ({
    page,
  }) => {
    await page.goto("/");
    await provideSystemInsets(page, { top: STATUS_BAR, bottom: GESTURE_BAR });

    const heading = await page
      .getByRole("heading", { level: 1, name: "Library" })
      .boundingBox();

    expect(heading?.y).toBeGreaterThanOrEqual(STATUS_BAR);
  });

  test("keeps the bottom bar above the gesture bar the app reports", async ({
    page,
  }) => {
    await page.goto("/");
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 0) >= BOTTOM_BAR_MAX_WIDTH, "phones only");
    await provideSystemInsets(page, { top: STATUS_BAR, bottom: GESTURE_BAR });

    const lastLink = await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .last()
      .boundingBox();

    expect((lastLink?.y ?? 0) + (lastLink?.height ?? 0)).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - GESTURE_BAR,
    );
  });
});
