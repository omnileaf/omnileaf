import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, FAKE_APP_VERSION, test } from "./fixtures.ts";

const BOTTOM_BAR_MAX_WIDTH = 600;
const STATUS_BAR = 59;
const HOME_INDICATOR = 34;
const FLOATING_BAR_GAP = 22;
const GESTURE_BAR = 24;
const LANDSCAPE_PHONE = { width: 844, height: 390 };
const NARROW_LANDSCAPE_PHONE = { width: 568, height: 320 };
const SIDE_CUTOUT = 59;
const LANDSCAPE_HOME_INDICATOR = 21;
const LANDSCAPE_STATUS_BAR = 24;
const THREE_BUTTON_BAR = 48;
const PAGE_PADDING = 24;

interface SafeAreaInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left?: number;
  readonly right?: number;
}

const LANDSCAPE_INSETS: SafeAreaInsets = {
  top: 0,
  left: SIDE_CUTOUT,
  right: SIDE_CUTOUT,
  bottom: LANDSCAPE_HOME_INDICATOR,
};

async function emulateSafeArea(page: Page, insets: SafeAreaInsets) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets });
}

async function provideSystemInsets(page: Page, insets: SafeAreaInsets) {
  await page.evaluate((sides) => {
    for (const [side, size] of Object.entries(sides)) {
      document.documentElement.style.setProperty(
        `--system-inset-${side}`,
        `${String(size)}px`,
      );
    }
  }, insets);
}

async function layoutBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the element has no layout box");
  }
  return box;
}

function navigationLinks(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link");
}

function pageHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Library" });
}

async function roomBelowLastLink(page: Page) {
  const lastLink = await layoutBox(navigationLinks(page).last());
  return LANDSCAPE_PHONE.height - lastLink.y - lastLink.height;
}

async function roomBelowPage(page: Page) {
  return page
    .getByRole("main")
    .evaluate((main) => parseFloat(getComputedStyle(main).paddingBlockEnd));
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

test.describe("in landscape", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(LANDSCAPE_PHONE);
  });

  test("keeps the rail and the heading clear of a cutout at the start", async ({
    page,
  }) => {
    await emulateSafeArea(page, LANDSCAPE_INSETS);

    await page.goto("/");
    const firstLink = await layoutBox(navigationLinks(page).first());
    const heading = await layoutBox(pageHeading(page));

    expect(firstLink.x).toBeGreaterThanOrEqual(SIDE_CUTOUT);
    expect(heading.x).toBeGreaterThanOrEqual(SIDE_CUTOUT);
  });

  test("keeps the page clear of a cutout at the end", async ({ page }) => {
    await emulateSafeArea(page, LANDSCAPE_INSETS);

    await page.goto("/");
    const heading = await layoutBox(pageHeading(page));

    expect(heading.x + heading.width).toBeLessThanOrEqual(
      LANDSCAPE_PHONE.width - SIDE_CUTOUT,
    );
  });

  test("lifts the rail and the page above the home indicator", async ({
    page,
  }) => {
    await page.goto("/");
    const usualRoomBelowLink = await roomBelowLastLink(page);
    const usualRoomBelowPage = await roomBelowPage(page);

    await emulateSafeArea(page, LANDSCAPE_INSETS);

    expect(await roomBelowLastLink(page)).toBe(
      usualRoomBelowLink + LANDSCAPE_HOME_INDICATOR,
    );
    expect(await roomBelowPage(page)).toBe(
      usualRoomBelowPage + LANDSCAPE_HOME_INDICATOR,
    );
  });

  test("mirrors the cutout clearance in right-to-left languages", async ({
    page,
  }) => {
    await emulateSafeArea(page, {
      top: 0,
      right: SIDE_CUTOUT,
      bottom: LANDSCAPE_HOME_INDICATOR,
    });

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    const firstLink = await layoutBox(navigationLinks(page).first());
    const heading = await layoutBox(pageHeading(page));

    expect(firstLink.x + firstLink.width).toBeLessThanOrEqual(
      LANDSCAPE_PHONE.width - SIDE_CUTOUT,
    );
    expect(heading.x).toBe(PAGE_PADDING);
  });

  test("keeps the page clear of side cutouts when the bottom bar shows", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_LANDSCAPE_PHONE);
    await emulateSafeArea(page, LANDSCAPE_INSETS);

    await page.goto("/");
    const heading = await layoutBox(pageHeading(page));

    expect(heading.x).toBeGreaterThanOrEqual(SIDE_CUTOUT);
    expect(heading.x + heading.width).toBeLessThanOrEqual(
      NARROW_LANDSCAPE_PHONE.width - SIDE_CUTOUT,
    );
  });
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

  test.describe("in landscape", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(LANDSCAPE_PHONE);
    });

    test("keeps the rail clear of a side cutout the app reports", async ({
      page,
    }) => {
      await page.goto("/");
      await provideSystemInsets(page, {
        top: LANDSCAPE_STATUS_BAR,
        bottom: 0,
        left: SIDE_CUTOUT,
      });

      const firstLink = await layoutBox(navigationLinks(page).first());

      expect(firstLink.x).toBeGreaterThanOrEqual(SIDE_CUTOUT);
    });

    test("keeps the page clear of the side navigation buttons the app reports", async ({
      page,
    }) => {
      await page.goto("/");
      await provideSystemInsets(page, {
        top: LANDSCAPE_STATUS_BAR,
        bottom: 0,
        right: THREE_BUTTON_BAR,
      });

      const heading = await layoutBox(pageHeading(page));

      expect(heading.x + heading.width).toBeLessThanOrEqual(
        LANDSCAPE_PHONE.width - THREE_BUTTON_BAR,
      );
    });
  });
});
