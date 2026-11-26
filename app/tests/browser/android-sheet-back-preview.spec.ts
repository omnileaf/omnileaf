import type { Locator, Page } from "@playwright/test";

import type { BackSwipe } from "../../src/lib/ipc/bindings.ts";
import { easedBackProgress } from "../../src/lib/navigation/back-progress.ts";
import type { FakeChannel } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const SCREEN_CORNER_PX = 32;
const HALFWAY = 0.5;
const FULL_PROGRESS = 1;
const SHRINK_WIDTH_PX = 48;
const SHRINK_HEIGHT_PX = 24;
const TOLERANCE_PX = 1;
const FIRST_FRAMES = 3;
const PHONE = { width: 412, height: 700 };
let gestures: FakeChannel<BackSwipe> | undefined;

test.use({
  platform: "android",
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    watchBackSwipes: (channel) => {
      gestures = channel;
      return null;
    },
  },
});

test.beforeEach(() => {
  gestures = undefined;
});

async function gesture(step: BackSwipe): Promise<void> {
  await expect.poll(() => gestures).toBeDefined();
  await gestures?.send(step);
}

function started(): BackSwipe {
  return {
    kind: "started",
    progress: 0,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

function moved(progress: number): BackSwipe {
  return {
    kind: "moved",
    progress,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("nothing to measure");
  }
  return box;
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
}

async function openSheet(page: Page, name: string): Promise<Locator> {
  await openLibrary(page);
  await page.getByRole("button", { name }).click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

function openViewOptions(page: Page): Promise<Locator> {
  return openSheet(page, "View options");
}

async function expectSheetAtRest(sheet: Locator, rest: Box): Promise<void> {
  await expect
    .poll(async () => {
      const box = await boxOf(sheet);
      return [box.x, box.y, box.width, box.height].map(Math.round);
    })
    .toEqual([rest.x, rest.y, rest.width, rest.height].map(Math.round));
}

async function expectSheetShrunkBy(
  sheet: Locator,
  rest: Box,
  eased: number,
): Promise<void> {
  const widthLost = SHRINK_WIDTH_PX * eased;
  const heightLost = SHRINK_HEIGHT_PX * eased;
  await expect
    .poll(async () => (await boxOf(sheet)).width)
    .toBeCloseTo(rest.width - widthLost, 0);
  const box = await boxOf(sheet);
  expect(Math.abs(box.height - (rest.height - heightLost))).toBeLessThanOrEqual(
    TOLERANCE_PX,
  );
  expect(
    Math.abs(box.y + box.height - (rest.y + rest.height)),
  ).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(
    Math.abs(box.x + box.width / 2 - (rest.x + rest.width / 2)),
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}

async function expectPageStill(page: Page): Promise<void> {
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("transform", "none");
  await expect(main).toHaveCSS("border-top-left-radius", "0px");
  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
}

test.describe("a bottom sheet while a back gesture is held", () => {
  test.use({ viewport: PHONE });

  test("shrinks 48 px narrower and 24 px shorter at full progress, about its bottom edge, the page still", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetShrunkBy(sheet, rest, easedBackProgress(FULL_PROGRESS));
    await expectPageStill(page);
  });

  test("shrinks by the eased share of that at half progress", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);

    await gesture(started());
    await gesture(moved(HALFWAY));

    await expectSheetShrunkBy(sheet, rest, easedBackProgress(HALFWAY));
  });

  test("shrinks its content evenly by the horizontal factor", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const content = sheet.locator(":scope > *").nth(1);
    const rest = await boxOf(content);
    const factor = (await boxOf(sheet)).width;

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expect
      .poll(async () => (await boxOf(content)).width / rest.width)
      .toBeCloseTo((factor - SHRINK_WIDTH_PX) / factor, 2);
    const shrunk = await boxOf(content);
    expect(shrunk.height / rest.height).toBeCloseTo(
      shrunk.width / rest.width,
      2,
    );
  });

  test("keeps every part of the sheet at its resting offset from the sheet's top, scaled by the horizontal factor", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const parts = sheet.locator(":scope > *");
    const restTop = (await boxOf(sheet)).y;
    const restOffsets: number[] = [];
    for (let at = 0; at < (await parts.count()); at += 1) {
      restOffsets.push((await boxOf(parts.nth(at))).y - restTop);
    }
    const restWidth = (await boxOf(sheet)).width;

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    const factor = (restWidth - SHRINK_WIDTH_PX) / restWidth;
    await expect
      .poll(async () => (await boxOf(sheet)).width)
      .toBeCloseTo(restWidth - SHRINK_WIDTH_PX, 0);
    const heldTop = (await boxOf(sheet)).y;
    expect(Math.max(...restOffsets)).toBeGreaterThan(SHRINK_HEIGHT_PX);
    for (const [at, offset] of restOffsets.entries()) {
      const top = (await boxOf(parts.nth(at))).y - heldTop;
      expect(Math.abs(top - offset * factor)).toBeLessThanOrEqual(TOLERANCE_PX);
    }
  });

  test("returns to rest when the gesture is cancelled", async ({ page }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));
    await expectSheetShrunkBy(sheet, rest, easedBackProgress(FULL_PROGRESS));

    await gesture({ kind: "cancelled" });

    await expectSheetAtRest(sheet, rest);
    await expect(sheet).toBeVisible();
    await expectPageStill(page);
  });

  test("opens at rest again once back has closed it", async ({ page }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));
    await expectSheetShrunkBy(sheet, rest, easedBackProgress(FULL_PROGRESS));
    await page.goBack();
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "View options" }).click();
    const reopened = page.getByRole("dialog", { name: "View options" });
    await expect(reopened).toBeVisible();
    await settle(reopened);

    await expectSheetAtRest(reopened, rest);
    await expect(reopened).not.toHaveAttribute("data-back", /.*/);
    const part = reopened.locator(":scope > *").nth(1);
    await expect(part).toHaveCSS("scale", "none");
  });

  test("opens at rest when it is opened again within its slide out", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));
    await expectSheetShrunkBy(sheet, rest, easedBackProgress(FULL_PROGRESS));
    const reopening = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          addEventListener(
            "popstate",
            () => {
              setTimeout(() => {
                document
                  .querySelector<HTMLElement>('[aria-label="View options"]')
                  ?.click();
                resolve();
              }, 60);
            },
            { once: true },
          );
        }),
    );

    await page.goBack();
    await reopening;

    const reopened = page.getByRole("dialog", { name: "View options" });
    await expect(reopened).toBeVisible();
    await settle(reopened);
    await expectSheetAtRest(reopened, rest);
    await expect(reopened).not.toHaveAttribute("data-back", /.*/);
  });

  test("slides out when it is closed within the spring back", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    await page.evaluate(() => {
      const ran: string[] = [];
      Object.assign(window, { ranTransitions: ran });
      document.addEventListener("transitionrun", (event) => {
        if (
          event.target instanceof Element &&
          event.target.getAttribute("role") === "dialog"
        ) {
          ran.push(event.propertyName);
        }
      });
    });
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await gesture({ kind: "cancelled" });
    await expect(sheet).toHaveAttribute("data-back", "cancelling");
    await page.keyboard.press("Escape");

    await expect(sheet).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { ranTransitions: string[] }).ranTransitions,
      ),
    ).toContain("translate");
  });

  test("closes from its shrunken size when back goes through, with no snap back to full size first", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));
    await expectSheetShrunkBy(sheet, rest, easedBackProgress(FULL_PROGRESS));
    const widths = page.evaluate(
      ({ frames }) =>
        new Promise<number[]>((resolve) => {
          addEventListener(
            "popstate",
            () => {
              const seen: number[] = [];
              const sample = () => {
                const open = document.querySelector('[role="dialog"]');
                seen.push(open?.getBoundingClientRect().width ?? 0);
                if (seen.length === frames) {
                  resolve(seen);
                  return;
                }
                requestAnimationFrame(sample);
              };
              requestAnimationFrame(sample);
            },
            { once: true },
          );
        }),
      { frames: FIRST_FRAMES },
    );

    await page.goBack();

    for (const width of await widths) {
      expect(width).toBeLessThan(rest.width - SHRINK_WIDTH_PX / 2);
    }
    await expect(sheet).toBeHidden();
    await expectPageStill(page);
  });

  test("shrinks again on the next gesture once a cancelled one has returned it to rest", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);
    await gesture(started());
    await gesture(moved(FULL_PROGRESS));
    await gesture({ kind: "cancelled" });
    await expectSheetAtRest(sheet, rest);

    await gesture(started());
    await gesture(moved(HALFWAY));

    await expectSheetShrunkBy(sheet, rest, easedBackProgress(HALFWAY));
  });

  test("keeps its size while held when reduced motion is on, and closes on back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const sheet = await openViewOptions(page);
    const rest = await boxOf(sheet);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetAtRest(sheet, rest);
    await page.goBack();
    await expect(sheet).toBeHidden();
  });

  test("keeps its size while held when the app's sheet motion is off", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    await page.evaluate(() => {
      document.documentElement.dataset.still = "sheets";
    });
    await settle(sheet);
    const rest = await boxOf(sheet);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetAtRest(sheet, rest);
    await page.goBack();
    await expect(sheet).toBeHidden();
  });

  test("keeps a dialog the size it is", async ({ page }) => {
    await page.goto("/settings/advanced");
    await page.getByRole("button", { name: /^Keep Undo for/ }).click();
    const dialog = page.getByRole("dialog", { name: "Keep Undo for" });
    await expect(dialog).toBeVisible();
    await settle(dialog);
    const rest = await boxOf(dialog);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetAtRest(dialog, rest);
  });

  test("shrinks no sheet below a menu that holds the gesture", async ({
    page,
  }) => {
    const sheet = await openSheet(page, "Sort and filter");
    const rest = await boxOf(sheet);
    await sheet.getByRole("combobox", { name: "Sort by" }).click();
    const menu = page.getByRole("listbox", { name: "Sort by" });
    await expect(menu).toBeVisible();
    const menuRest = await boxOf(menu);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetAtRest(sheet, rest);
    await expectSheetAtRest(menu, menuRest);
  });
});

test.describe("what Sort and filter is on a tablet", () => {
  test("is a dialog there, so it keeps its size while back is held", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "A phone's sheet is covered above",
    );
    const sheet = await openSheet(page, "Sort and filter");
    const rest = await boxOf(sheet);

    await gesture(started());
    await gesture(moved(FULL_PROGRESS));

    await expectSheetAtRest(sheet, rest);
    await page.goBack();
    await expect(sheet).toBeHidden();
  });
});
