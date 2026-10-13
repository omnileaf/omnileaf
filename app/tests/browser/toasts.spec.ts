import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";

const SPREAD_GAP = 8;
const SWIPE_DISTANCE = 120;
const SWIPE_STEPS = 12;

const failures = { count: 0 };

const FAILS_EACH_TIME: FakeBackend = {
  ...DEFAULT_BACKEND,
  addLibraryFolder: () => {
    failures.count += 1;
    throw new CommandFailure({
      code: failures.count % 2 === 1 ? "folderUnreadable" : "internal",
      message: "the folder could not be added",
    });
  },
};

test.use({ backend: FAILS_EACH_TIME });

test.beforeEach(() => {
  failures.count = 0;
});

function toasts(page: Page): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem");
}

function toastSaying(page: Page, title: string): Locator {
  return toasts(page).filter({ hasText: title });
}

async function stackTwoWarnings(page: Page) {
  await page.goto("/");
  const addFolder = page
    .getByRole("region", { name: "Your library is empty" })
    .getByRole("button", { name: "Add a folder" });
  await addFolder.click();
  await expect(toastSaying(page, "Couldn't read that folder")).toBeVisible();
  await addFolder.click();
  const newer = toastSaying(page, "Couldn't add the folder");
  const older = toastSaying(page, "Couldn't read that folder");
  await expect(newer).toHaveAttribute("data-front", "true");
  await settle(newer);
  return { newer, older };
}

async function expectSpread(older: Locator, newer: Locator): Promise<void> {
  await expect(older).toHaveAttribute("data-expanded", "true");
  await settle(older);
  const front = await boxOf(newer);
  const behind = await boxOf(older);
  expect(Math.round(front.y - (behind.y + behind.height))).toBe(SPREAD_GAP);
}

test("stacks the newest toast in front of the older one", async ({ page }) => {
  const { newer, older } = await stackTwoWarnings(page);

  await expect(older).toHaveAttribute("data-front", "false");
  await expect(older).toHaveAttribute("data-expanded", "false");
  const front = await boxOf(newer);
  const behind = await boxOf(older);
  expect(behind.y + behind.height).toBeGreaterThan(front.y);
});

test("spreads the stack 8px apart while the pointer is over it", async ({
  page,
}) => {
  test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "pointer screens");
  const { newer, older } = await stackTwoWarnings(page);

  await newer.hover();

  await expectSpread(older, newer);
});

test("spreads the stack 8px apart once it's tapped", async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, "touch screens only");
  const { newer, older } = await stackTwoWarnings(page);

  await newer.getByText("Couldn't add the folder").tap();

  await expectSpread(older, newer);
});

test("spreads the stack 8px apart while focus is in it", async ({ page }) => {
  const { newer, older } = await stackTwoWarnings(page);

  await page.keyboard.press("F6");
  await page.keyboard.press("Tab");

  await expect(newer).toBeFocused();
  await expectSpread(older, newer);
});

test("swipes a toast away, down on a phone and towards the end on a desktop", async ({
  page,
}) => {
  const { newer } = await stackTwoWarnings(page);
  const isPhone = viewportOf(page).width < MEDIUM_MIN_WIDTH;
  const box = await boxOf(newer.getByText("Couldn't add the folder"));
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + (isPhone ? 0 : SWIPE_DISTANCE),
    start.y + (isPhone ? SWIPE_DISTANCE : 0),
    { steps: SWIPE_STEPS },
  );
  await page.mouse.up();

  await expect(newer).toHaveCount(0);
  await expect(toastSaying(page, "Couldn't read that folder")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a spread stack has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const { newer, older } = await stackTwoWarnings(page);
    await page.keyboard.press("F6");
    await page.keyboard.press("Tab");
    await expectSpread(older, newer);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
