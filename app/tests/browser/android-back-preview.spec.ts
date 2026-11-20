import type { Page } from "@playwright/test";

import type { BackSwipe } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  test,
  viewportOf,
} from "./fixtures.ts";

const SCREEN_CORNER_PX = 32;
const SMALLEST_SCALE = 0.9;
const EDGE_MARGIN_PX = 8;
const PRIVACY = "/settings/privacy";
const SETTINGS = "/settings";

let gestures: FakeChannel<BackSwipe> | undefined;

test.use({
  platform: "android",
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    watchBackSwipes: (channel) => {
      gestures = channel;
      return null;
    },
  },
});

test.beforeEach(({ page }) => {
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "Settings opens its pages beside the list on a wide screen",
  );
  gestures = undefined;
});

async function gesture(step: BackSwipe): Promise<void> {
  await expect.poll(() => gestures).toBeDefined();
  await gestures?.send(step);
}

function swipe(
  progress: number,
  change: Partial<Extract<BackSwipe, { kind: "moved" }>> = {},
): BackSwipe {
  return {
    kind: "moved",
    progress,
    edge: "left",
    touchY: 0.5,
    corner: SCREEN_CORNER_PX,
    ...change,
  };
}

async function openPrivacyFromSettings(page: Page): Promise<void> {
  await page.goto(SETTINGS);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, PRIVACY);
  await expect(page).toHaveURL(PRIVACY);
}

async function widthOf(page: Page): Promise<number> {
  return page.getByRole("main").evaluate((main) => main.clientWidth);
}

interface Placement {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

async function placementOf(page: Page): Promise<Placement> {
  return page.getByRole("main").evaluate((main) => {
    const { a, e, f } = new DOMMatrixReadOnly(getComputedStyle(main).transform);
    return { scale: a, x: e, y: f };
  });
}

test("shrinks a page swiped from the left to 90% and moves it to 8 px from the right edge, with the screen's corners", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  const width = await widthOf(page);

  await gesture(swipe(1));

  const shift = (width - width * SMALLEST_SCALE) / 2 - EDGE_MARGIN_PX;
  await expect.poll(async () => (await placementOf(page)).x).toBeCloseTo(shift);
  expect((await placementOf(page)).scale).toBeCloseTo(SMALLEST_SCALE);
  await expect(page.getByRole("main")).toHaveCSS(
    "border-top-left-radius",
    `${String(SCREEN_CORNER_PX)}px`,
  );
});

test("shrinks a page swiped from the right in the middle", async ({ page }) => {
  await openPrivacyFromSettings(page);

  await gesture(swipe(1, { edge: "right" }));

  await expect(page.getByRole("main")).toHaveCSS(
    "transform",
    "matrix(0.9, 0, 0, 0.9, 0, 0)",
  );
});

test("follows the finger down the screen", async ({ page }) => {
  await openPrivacyFromSettings(page);
  await gesture(swipe(0));

  await gesture(swipe(1, { touchY: 0.9 }));

  await expect.poll(async () => (await placementOf(page)).y).toBeGreaterThan(0);
});

test("shows the page it goes back to behind the shrinking page, dimmed", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);

  await gesture(swipe(0.5));

  const behind = page.locator("[data-previous-screen]");
  await expect(behind).toContainText("Privacy and security");
  await expect(behind.locator("div").last()).toHaveCSS("opacity", "0.2");
});

test("springs the page back and takes the page behind away when the gesture is cancelled", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await gesture(swipe(1));

  await gesture({ kind: "cancelled" });

  await expect(page.getByRole("main")).toHaveCSS("transform", "none");
  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
});

test("lets the page leave and settles the page behind in its place once back goes through", async ({
  page,
}) => {
  await openPrivacyFromSettings(page);
  await gesture(swipe(1));

  await page.goBack();

  await expect(page).toHaveURL(SETTINGS);
  await expect(page.locator("[data-leaving-screen]")).toBeAttached();
  await expect(page.locator("[data-leaving-screen]")).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveCSS("transform", "none");
});

test("neither shrinks nor moves the page when reduced motion is on", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPrivacyFromSettings(page);

  await gesture(swipe(1, { touchY: 0.9 }));

  await expect(page.getByRole("main")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await expect(page.getByRole("main")).toHaveCSS(
    "border-top-left-radius",
    "0px",
  );
});
