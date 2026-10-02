import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const FADE = "0.15s ease-out";
const GROW = "0.2s cubic-bezier(0.2, 0, 0, 1)";
const SLIDE = "0.35s cubic-bezier(0.32, 0.72, 0, 1)";
const PILL_GROW = `pill-grow ${GROW}`;
const ICON_POP = "nav-pop 0.3s cubic-bezier(0.32, 0.72, 0, 1)";

const PLATFORMS: readonly Platform[] = ["android", "ios", "linux"];

interface Motion {
  readonly transitions: readonly string[];
  readonly animations: readonly string[];
}

const STILL: Motion = { transitions: [], animations: [] };

function motionIn(locator: Locator): Promise<Motion> {
  return locator.evaluate((root) => {
    const rendered = [root, ...root.querySelectorAll("*")].filter((element) =>
      element.checkVisibility(),
    );
    const transitions = new Set<string>();
    const animations = new Set<string>();
    for (const element of rendered) {
      const style = getComputedStyle(element);
      if (style.transitionDuration.split(", ").some((part) => part !== "0s")) {
        transitions.add(
          `${style.transitionDuration} ${style.transitionTimingFunction}`,
        );
      }
      if (style.animationName !== "none") {
        animations.add(
          `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction}`,
        );
      }
    }
    return {
      transitions: Array.from(transitions).toSorted(),
      animations: Array.from(animations).toSorted(),
    };
  });
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function tab(page: Page, name: string): Locator {
  return navigation(page).getByRole("link", { name });
}

function glassPill(page: Page): Locator {
  return navigation(page).locator('li[aria-hidden="true"]');
}

async function settle(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((motion) => motion.finished)).then(
      () => undefined,
    ),
  );
}

async function openHistoryAndSettle(page: Page): Promise<void> {
  await tab(page, "History").click();
  await expect(tab(page, "History")).toHaveAttribute("aria-current", "page");
  await settle(glassPill(page));
}

test.describe("on Android", () => {
  test.use(onPlatform("android"));

  test("grows the new tab's pill in and fades the old one out", async ({
    page,
  }) => {
    await page.goto("/history");
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "bar and rail only",
    );

    const current = await motionIn(tab(page, "History"));
    const previous = await motionIn(tab(page, "Library"));

    expect(current.animations).toContain(PILL_GROW);
    expect(previous.transitions).toContain(GROW);
  });

  test("only fades the sidebar's highlight", async ({ page }) => {
    await page.goto("/history");
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "sidebar only");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });
});

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("slides one glass pill under the new tab", async ({ page }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await expect(glassPill(page)).toHaveCount(1);

    await openHistoryAndSettle(page);

    const pill = await boxOf(glassPill(page));
    const history = await boxOf(tab(page, "History"));
    expect(await motionIn(glassPill(page))).toEqual({
      transitions: [SLIDE],
      animations: [],
    });
    expect(pill.x).toBeCloseTo(history.x, 0);
    expect(pill.width).toBeCloseTo(history.width, 0);
  });

  test("slides the glass pill the other way in right-to-left layouts", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await expect(glassPill(page)).toHaveCount(1);

    await openHistoryAndSettle(page);

    const pill = await boxOf(glassPill(page));
    const history = await boxOf(tab(page, "History"));
    expect(pill.x).toBeCloseTo(history.x, 0);
  });

  test("bounces the new tab's icon", async ({ page }) => {
    await page.goto("/history");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

    const current = await motionIn(tab(page, "History"));

    expect(current.animations).toContain(ICON_POP);
  });

  test("only fades the rail's and sidebar's highlight", async ({ page }) => {
    await page.goto("/history");
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "tablets and desktops only",
    );

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });
});

test.describe("on desktop", () => {
  test.use(onPlatform("linux"));

  test("only fades the highlight and keeps every icon still", async ({
    page,
  }) => {
    await page.goto("/history");

    const motion = await motionIn(navigation(page));

    expect(motion).toEqual({ transitions: [FADE], animations: [] });
  });
});

for (const platform of PLATFORMS) {
  test.describe(`on ${platform} with reduce motion`, () => {
    test.use(onPlatform(platform));

    test("changes the navigation at once", async ({ page }) => {
      await page.goto("/history");
      const motion = await motionIn(navigation(page));

      await page.emulateMedia({ reducedMotion: "reduce" });

      expect(motion).not.toEqual(STILL);
      expect(await motionIn(navigation(page))).toEqual(STILL);
    });
  });
}
