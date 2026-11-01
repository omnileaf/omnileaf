import type { Locator, Page } from "@playwright/test";

import type { BackSwipe, Platform } from "../../src/lib/ipc/bindings.ts";

import type { FakeChannel } from "./fake-backend.ts";
import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGEST_TEXT_SCALE,
  setTextScale,
  test,
  viewportOf,
} from "./fixtures.ts";
import { BOOKS_PER_PAGE, FakeShelf, SERIES_ID } from "./series-shelf.ts";

const TABLET = { width: 820, height: 1180 };
const SIDEWAYS_IPHONE_MINI = { width: 812, height: 375 };
const NARROWEST_WINDOW = { width: 200, height: 568 };
const IPHONE_SE = { width: 320, height: 568 };
const BOOK_PAGES = 192;
const LONG_PRESS_MS = 600;
const FULL_SWIPE = 0.75;
const SHORT_SWIPE = 0.25;
const SWIPED_PAST_HALFWAY = 0.7;
const EASED_BACK_PX = [-11, -14] as const;
const NUDGED_ON_PX = [11, 16] as const;
const DRAGGED_TOWARD_START_PX = [-30, -60] as const;

let swipes: FakeChannel<BackSwipe> | undefined;

type PhonePlatform = Extract<Platform, "ios" | "android">;

let shelf = new FakeShelf([]);

test.beforeEach(() => {
  shelf = new FakeShelf(
    [
      { state: "read" },
      { state: "started", page: 14 },
      { state: "notStarted" },
      { state: "notStarted" },
    ],
    {},
    BOOK_PAGES,
  );
  swipes = undefined;
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
    watchBackSwipes: (channel) => {
      swipes = channel;
      return null;
    },
    allowBackSwipe: () => null,
  },
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await revealRows(page);
}

async function revealRows(page: Page): Promise<void> {
  await page.locator(".virtual-rows").scrollIntoViewIfNeeded();
  await expect(page.locator(".virtual-rows li").first()).toBeVisible();
}

function bookRows(page: Page): Locator {
  return page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

function bookMore(page: Page, index: number): Locator {
  return page.getByRole("button", { name: `More for ${shelf.titleOf(index)}` });
}

function bookCheckbox(page: Page, index: number): Locator {
  return page.getByRole("checkbox", { name: `Select ${shelf.titleOf(index)}` });
}

function selectedBooks(page: Page): Locator {
  return page.getByRole("group", { name: "Selected books" });
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

async function startPickingFrom(page: Page, index: number): Promise<void> {
  await bookMore(page, index).click();
  await page
    .getByRole("dialog", { name: shelf.titleOf(index) })
    .getByRole("button", { name: "Select", exact: true })
    .or(page.getByRole("menuitem", { name: "Select", exact: true }))
    .click();
}

async function longPress(page: Page, index: number): Promise<void> {
  await page.clock.install();
  await openSeries(page);
  await hold(page, bookRows(page).getByText(shelf.titleOf(index)));
}

async function hold(page: Page, target: Locator): Promise<void> {
  await target.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await page.clock.runFor(LONG_PRESS_MS);
  await target.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });
  await target.dispatchEvent("click");
}

interface Finger {
  readonly down: () => Promise<void>;
  readonly moveTo: (...offsets: readonly number[]) => Promise<void>;
  readonly liftAt: (offset: number) => Promise<void>;
}

async function fingerOn(target: Locator): Promise<Finger> {
  const box = await boxOf(target);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const at = (offset: number) => ({
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    clientX: start.x + offset,
    clientY: start.y,
  });
  return {
    down: () => target.dispatchEvent("pointerdown", at(0)),
    moveTo: async (...offsets) => {
      for (const offset of offsets) {
        await target.dispatchEvent("pointermove", at(offset));
      }
    },
    liftAt: (offset) => target.dispatchEvent("pointerup", at(offset)),
  };
}

async function swipe(page: Page, index: number, share: number): Promise<void> {
  const link = plateRows(page).nth(index).getByRole("link");
  const across = (await boxOf(link)).width * share;
  const finger = await fingerOn(link);
  await finger.down();
  await finger.moveTo(across / 4, across / 2, across);
  await finger.liftAt(across);
}

const ENDINGS = ["Mark read", "Done or close", "Escape", "Back"] as const;

async function endPicking(
  page: Page,
  ending: (typeof ENDINGS)[number],
  platform: Platform | undefined,
): Promise<void> {
  switch (ending) {
    case "Mark read":
      await selectedBooks(page)
        .getByRole("button", { name: "Mark read" })
        .click();
      return;
    case "Done or close":
      await page
        .locator("[data-picking-bar]")
        .getByRole("button", {
          name: platform === "ios" ? "Done" : "Clear the selection",
        })
        .click();
      return;
    case "Escape":
      await page.keyboard.press("Escape");
      return;
    case "Back":
      if (platform === "ios") {
        await expect.poll(() => swipes).toBeDefined();
        await swipes?.send({ kind: "moved", progress: SWIPED_PAST_HALFWAY });
        await swipes?.send({
          kind: "released",
          progress: SWIPED_PAST_HALFWAY,
          velocity: 0,
        });
        return;
      }
      await page.goBack();
  }
}

function plateRows(page: Page): Locator {
  return page.locator("[data-book-plate] li");
}

async function startPickingAnyLanguage(page: Page, index: number) {
  await plateRows(page).nth(index).getByRole("button").click();
  await page
    .locator(
      '[role="menuitem"]:has(.lucide-list-checks), [role="dialog"] button:has(.lucide-list-checks)',
    )
    .click();
}

async function isClipped(action: Locator): Promise<boolean> {
  return action.evaluate((button) => {
    const content = button.firstElementChild;
    if (content === null) {
      return true;
    }
    const outer = button.getBoundingClientRect();
    const inner = content.getBoundingClientRect();
    return inner.left < outer.left - 0.5 || inner.right > outer.right + 0.5;
  });
}

async function linesOf(text: Locator): Promise<number> {
  return text.evaluate((element) => {
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    return Math.round(element.getBoundingClientRect().height / lineHeight);
  });
}

function isOnPhone(platform: Platform | undefined): platform is PhonePlatform {
  return platform === "ios" || platform === "android";
}

test.describe(
  "picking the series' books on a phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(!isOnPhone(platform), "the phones' own picking");
    });

    test("puts Select all, the count and Done in an iPhone's bar", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's bar");
      await openSeries(page);

      await startPickingFrom(page, 1);

      const bar = page.locator("[data-picking-bar]");
      await expect(bar.getByRole("button")).toHaveText(["Select all", "Done"]);
      await expect(
        bar.getByRole("heading", { level: 2, name: "1 selected" }),
      ).toBeVisible();
      await bar.getByRole("button", { name: "Done" }).click();
      await expect(bookCheckbox(page, 1)).toHaveCount(0);
    });

    test("puts close, the count and Select all in Android's contextual bar", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's contextual bar");
      await openSeries(page);

      await startPickingFrom(page, 1);

      const bar = page.locator("[data-picking-bar]");
      await expect(bar.getByRole("button")).toHaveCount(2);
      await expect(bar.getByRole("button").first()).toHaveAccessibleName(
        "Clear the selection",
      );
      await expect(bar.getByRole("button").last()).toHaveText("Select all");
      await expect(
        bar.getByRole("heading", { level: 2, name: "1 selected" }),
      ).toBeVisible();
      await bar.getByRole("button", { name: "Clear the selection" }).click();
      await expect(bookCheckbox(page, 1)).toHaveCount(0);
    });

    test("puts the actions in the tab bar's own slot while picking", async ({
      page,
      platform,
    }) => {
      await openSeries(page);
      const tabBar = await boxOf(navigation(page));

      await startPickingFrom(page, 1);

      await expect(navigation(page)).toBeHidden();
      const actions = selectedBooks(page).getByRole("button");
      await expect(actions).toHaveCount(3);
      await expect(actions.first()).toHaveAccessibleName("Mark read");
      await expect(actions.nth(1)).toHaveAccessibleName("Mark unread");
      await expect(actions.last()).toHaveAccessibleName("Delete");
      await expect(actions.first()).toHaveText(
        platform === "ios" ? "" : "Mark read",
      );
      const toolbar = await boxOf(selectedBooks(page));
      expect(
        Math.abs(toolbar.y + toolbar.height - (tabBar.y + tabBar.height)),
      ).toBeLessThanOrEqual(1);
      if (platform === "ios") {
        expect(
          Math.abs(
            toolbar.x + toolbar.width / 2 - (tabBar.x + tabBar.width / 2),
          ),
        ).toBeLessThanOrEqual(1);
      } else {
        expect(Math.abs(toolbar.y - tabBar.y)).toBeLessThanOrEqual(1);
        expect(toolbar.width).toBe(tabBar.width);
      }
    });

    for (const ending of ENDINGS) {
      test(`brings the tab bar back once picking ends with ${ending}`, async ({
        page,
        platform,
      }) => {
        if (ending === "Back" && platform !== "ios") {
          await page.goto("/");
        }
        await openSeries(page);
        await startPickingFrom(page, 1);
        await expect(navigation(page)).toBeHidden();

        await endPicking(page, ending, platform);

        await expect(bookCheckbox(page, 1)).toHaveCount(0);
        await expect(navigation(page)).toBeVisible();
      });
    }

    test("brings the tab bar back after leaving the page mid-pick", async ({
      page,
    }) => {
      await openSeries(page);
      await startPickingFrom(page, 1);
      await expect(navigation(page)).toBeHidden();

      await page.evaluate(() => {
        const away = document.createElement("a");
        away.href = "/";
        document.body.append(away);
        away.click();
      });

      await expect(page).toHaveURL(/\/$/u);
      await expect(navigation(page)).toBeVisible();
    });

    test("moves focus to the picked count once Select starts picking", async ({
      page,
    }) => {
      await openSeries(page);

      await startPickingFrom(page, 1);

      const count = page.getByRole("heading", { level: 2, name: "1 selected" });
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(count).toBeFocused();
      await expect(count).toHaveAttribute("aria-live", "polite");
    });

    test("keeps the last book clear of Android's docked toolbar at the largest text", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's docked toolbar");
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openSeries(page);
      await page.evaluate(() => {
        document.documentElement.style.setProperty(
          "--system-inset-bottom",
          "48px",
        );
      });
      await startPickingFrom(page, 1);

      await expect(async () => {
        await page.getByRole("main").evaluate((main) => {
          main.scrollTo({ top: main.scrollHeight });
        });
        const last = await boxOf(bookRows(page).last());
        const toolbar = await boxOf(selectedBooks(page));
        expect(last.y + last.height).toBeLessThanOrEqual(toolbar.y);
      }).toPass({ timeout: 5_000 });
    });

    test.describe("when marking the books picked fails", () => {
      test.use({
        backend: {
          ...DEFAULT_BACKEND,
          seriesOverview: (id) => shelf.backend().seriesOverview(id),
          seriesBooks: (id, listing, after) =>
            shelf.backend().seriesBooks(id, listing, after),
          markBooks: () => {
            throw new CommandFailure({
              code: "internal",
              message: "something went wrong inside the app",
            });
          },
        },
      });

      test("keeps the failure clear of Android's docked toolbar", async ({
        page,
        platform,
      }) => {
        test.skip(platform !== "android", "Android's docked toolbar");
        await openSeries(page);
        await startPickingFrom(page, 1);

        await selectedBooks(page)
          .getByRole("button", { name: "Mark read" })
          .click();

        const failure = page.getByText("Couldn't mark those books. Try again.");
        await expect(failure).toBeVisible();
        await expect(async () => {
          await page.getByRole("main").evaluate((main) => {
            main.scrollTo({ top: main.scrollHeight });
          });
          const line = await boxOf(failure);
          const toolbar = await boxOf(selectedBooks(page));
          expect(line.y + line.height).toBeLessThanOrEqual(toolbar.y);
        }).toPass({ timeout: 5_000 });
      });
    });

    test("gives a picked book's row the selected fill beside its check", async ({
      page,
    }) => {
      await openSeries(page);
      await startPickingFrom(page, 1);

      const picked = bookRows(page).nth(1).locator("[data-picked]");
      await expect(picked).toBeVisible();
      await expect(bookCheckbox(page, 1)).toBeChecked();
      const fill = await picked.evaluate(
        (row) => getComputedStyle(row).backgroundColor,
      );
      const rest = await bookRows(page)
        .nth(2)
        .locator("label")
        .evaluate((row) => getComputedStyle(row).backgroundColor);
      expect(fill).not.toBe(rest);
    });

    test("opens the book's menu with no heading on an iPhone's long press", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's context menu");

      await longPress(page, 1);

      const menu = page.getByRole("menu");
      await expect(menu).toHaveAccessibleName(
        `${shelf.titleOf(1)} · Page 14 of ${String(BOOK_PAGES)}`,
      );
      await expect(menu.locator("p")).toHaveCount(0);
      await expect(menu.getByRole("menuitem")).toHaveText([
        "Continue reading",
        "Mark read",
        "Select",
      ]);
      await expect(bookCheckbox(page, 1)).toHaveCount(0);
    });

    test("keeps the book's menu open when an iPhone's long press lifts off its More button", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's context menu");
      await page.clock.install();
      await openSeries(page);

      await hold(page, bookMore(page, 1));

      await expect(bookMore(page, 1)).toHaveAttribute("aria-expanded", "true");
    });

    test("starts picking with Android's long press", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's long press");

      await longPress(page, 1);

      await expect(bookCheckbox(page, 1)).toBeChecked();
      await expect(page.getByRole("menu")).toHaveCount(0);
    });

    test("draws the swiped action as a capsule on an iPhone", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await openSeries(page);

      await swipe(page, 2, SHORT_SWIPE);

      await expect(
        bookRows(page).nth(2).getByRole("button", { name: "Mark read" }),
      ).toBeVisible();
      const row = bookRows(page).nth(2).locator("[data-swiped]");
      const box = await boxOf(row);
      const radius = await row.evaluate(
        (swiped) => getComputedStyle(swiped).borderStartStartRadius,
      );
      expect(Number.parseFloat(radius)).toBeGreaterThanOrEqual(box.height / 2);
    });

    for (const look of [
      { name: "the default text", scale: undefined, language: undefined },
      {
        name: "the largest text",
        scale: LARGEST_TEXT_SCALE,
        language: undefined,
      },
      { name: "a long language", scale: undefined, language: "en-XA" },
    ]) {
      test(`fits Mark unread inside the iPhone's swiped capsule at ${look.name}`, async ({
        page,
        platform,
      }) => {
        test.skip(platform !== "ios", "the iPhone's swipe capsules");
        if (look.language !== undefined) {
          await page.addInitScript((language) => {
            window.localStorage.setItem("omnileaf.language", language);
          }, look.language);
        }
        if (look.scale !== undefined) {
          await setTextScale(page, look.scale);
        }
        await page.goto(`/series/${SERIES_ID}`);
        await revealRows(page);

        await swipe(page, 0, SHORT_SWIPE);

        const action = plateRows(page).first().locator("[data-swipe-action]");
        await expect(action).toBeVisible();
        await expect.poll(() => isClipped(action)).toBe(false);
      });
    }

    test("offers Undo after a full swipe on an iPhone", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe Undo");
      await openSeries(page);

      await swipe(page, 2, FULL_SWIPE);

      await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    });

    test("marks nothing when an open capsule is eased back toward closed at the largest text", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openSeries(page);
      await swipe(page, 0, SHORT_SWIPE);
      await expect(
        plateRows(page).first().locator("[data-swipe-action]"),
      ).toBeVisible();
      const finger = await fingerOn(plateRows(page).first().getByRole("link"));

      await finger.down();
      await finger.moveTo(...EASED_BACK_PX);
      await finger.liftAt(EASED_BACK_PX[1]);

      expect(shelf.marked).toEqual([]);
      await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    });

    test("marks nothing when an open capsule is nudged a little further at the largest text", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openSeries(page);
      await swipe(page, 0, SHORT_SWIPE);
      await expect(
        plateRows(page).first().locator("[data-swipe-action]"),
      ).toBeVisible();
      const finger = await fingerOn(plateRows(page).first().getByRole("link"));

      await finger.down();
      await finger.moveTo(...NUDGED_ON_PX);
      await finger.liftAt(NUDGED_ON_PX[1]);

      expect(shelf.marked).toEqual([]);
      await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    });

    test("leaves the row still while the finger that opened an iPhone's book menu slides on", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's context menu");
      await page.clock.install();
      await openSeries(page);
      const across = (await boxOf(plateRows(page).nth(2))).width;
      const finger = await fingerOn(plateRows(page).nth(2).getByRole("link"));
      await finger.down();
      await page.clock.runFor(LONG_PRESS_MS);
      await expect(page.getByRole("menu")).toBeVisible();

      await finger.moveTo(
        across * SHORT_SWIPE,
        across / 2,
        across * FULL_SWIPE,
      );
      await finger.liftAt(across * FULL_SWIPE);

      expect(shelf.marked).toEqual([]);
      await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    });

    test("keeps an iPhone's row square while it is dragged toward a side with no action", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await openSeries(page);
      const finger = await fingerOn(plateRows(page).nth(2).getByRole("link"));

      await finger.down();
      await finger.moveTo(...DRAGGED_TOWARD_START_PX);

      await expect(plateRows(page).nth(2).locator("[data-swiped]")).toHaveCSS(
        "border-start-start-radius",
        "0px",
      );
    });

    test("shows the phone's own button under an empty list", async ({
      page,
      platform,
    }) => {
      shelf = new FakeShelf(
        [{ state: "read" }, { state: "read" }],
        {},
        BOOK_PAGES,
      );
      await openSeries(page);

      await page.getByRole("radio", { name: "Unread" }).click();

      const showAll = page.getByRole("button", { name: "Show all books" });
      await expect(showAll).toBeVisible();
      if (platform === "ios") {
        await expect(showAll).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      } else {
        await expect(showAll).not.toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
      }
    });

    test("keeps the picking bar's words inside the narrowest window at the largest text", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem("omnileaf.language", "en-XA");
      });
      await page.setViewportSize(NARROWEST_WINDOW);
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await page.goto(`/series/${SERIES_ID}`);
      await page.locator("[data-book-plate]").scrollIntoViewIfNeeded();

      await startPickingAnyLanguage(page, 1);

      const bar = page.locator("[data-picking-bar]");
      const controls = bar.getByRole("button");
      await expect(controls).toHaveCount(2);
      for (const control of [
        ...(await controls.all()),
        bar.getByRole("heading", { level: 2 }),
      ]) {
        const box = await boxOf(control);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(NARROWEST_WINDOW.width);
        expect(
          await control.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
      }
    });

    test("keeps an iPhone's toolbar with its actions unavailable once the last book is unticked", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's picking toolbar");
      await openSeries(page);
      await startPickingFrom(page, 1);
      const actions = selectedBooks(page).getByRole("button");
      const enabledColour = await actions
        .first()
        .evaluate((action) => getComputedStyle(action).color);

      await bookCheckbox(page, 1).click();

      await expect(
        page.getByRole("heading", { level: 2, name: "0 selected" }),
      ).toBeVisible();
      for (const action of await actions.all()) {
        await expect(action).toBeDisabled();
        await expect(action).not.toHaveCSS("color", enabledColour);
      }
    });

    test("ends Android's picking once the last book is unticked", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's contextual bar");
      await openSeries(page);
      await startPickingFrom(page, 1);

      await bookCheckbox(page, 1).click();

      await expect(bookCheckbox(page, 1)).toHaveCount(0);
      await expect(page.locator("[data-picking-bar]")).toHaveCount(0);
      await expect(selectedBooks(page)).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
    });

    for (const look of [
      { name: "two lines on a phone", viewport: undefined, lines: 2 },
      { name: "today's one line on a tablet", viewport: TABLET, lines: 1 },
    ]) {
      test(`keeps every book's title ${look.name} while picking at the largest text`, async ({
        page,
      }) => {
        if (look.viewport !== undefined) {
          await page.setViewportSize(look.viewport);
        }
        await setTextScale(page, LARGEST_TEXT_SCALE);
        await openSeries(page);

        await startPickingFrom(page, 1);

        const title = bookRows(page).nth(2).getByText(shelf.titleOf(2));
        await expect(bookCheckbox(page, 1)).toBeChecked();
        await expect.poll(() => linesOf(title)).toBe(look.lines);
      });
    }

    test("says the count once after Select all", async ({ page }) => {
      await openSeries(page);
      await startPickingFrom(page, 1);

      await page
        .locator("[data-picking-bar]")
        .getByRole("button", { name: "Select all" })
        .click();

      await expect(
        page.getByRole("heading", { level: 2, name: "4 selected" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "4 selected" }).getByRole("status"),
      ).toHaveText("");
    });

    test("leaves picking ended when it ends before Select all has every book", async ({
      page,
      platform,
    }) => {
      shelf = new FakeShelf(
        Array.from({ length: BOOKS_PER_PAGE + 5 }, () => ({
          state: "notStarted" as const,
        })),
        {},
        BOOK_PAGES,
      );
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.goto(`/series/${SERIES_ID}`);
      await bookMore(page, 1).scrollIntoViewIfNeeded();
      shelf.holdPagesAfterTheFirst(held);
      await startPickingFrom(page, 1);
      await page
        .locator("[data-picking-bar]")
        .getByRole("button", { name: "Select all" })
        .click();

      const rows = page.locator(".virtual-rows");
      const firstPageHeight = await rows.evaluate((list) => list.scrollHeight);
      await endPicking(page, "Done or close", platform);
      release();

      await expect
        .poll(() => rows.evaluate((list) => list.scrollHeight))
        .toBeGreaterThan(firstPageHeight);
      await expect(page.getByRole("main").getByRole("status")).toHaveText("");
      await expect(navigation(page)).toBeVisible();
    });

    test("turns an iPhone's Select all into Deselect all, which clears the picks", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's bar");
      await openSeries(page);
      await startPickingFrom(page, 1);
      const bar = page.locator("[data-picking-bar]");

      await bar.getByRole("button", { name: "Select all" }).click();
      await bar.getByRole("button", { name: "Deselect all" }).click();

      await expect(
        bar.getByRole("heading", { level: 2, name: "0 selected" }),
      ).toBeVisible();
      await expect(bookCheckbox(page, 1)).not.toBeChecked();
      await expect(bar.getByRole("button")).toHaveText(["Select all", "Done"]);
    });

    test("keeps focus on an iPhone's Select all as it turns into Deselect all and back", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's bar");
      await openSeries(page);
      await startPickingFrom(page, 1);
      const bar = page.locator("[data-picking-bar]");

      await bar.getByRole("button", { name: "Select all" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        bar.getByRole("button", { name: "Deselect all" }),
      ).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(
        bar.getByRole("button", { name: "Select all" }),
      ).toBeFocused();
    });

    test("keeps Android's Select all once every book is picked", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "android", "Android's contextual bar");
      await openSeries(page);
      await startPickingFrom(page, 1);
      const bar = page.locator("[data-picking-bar]");

      await bar.getByRole("button", { name: "Select all" }).click();

      await expect(
        bar.getByRole("heading", { level: 2, name: "4 selected" }),
      ).toBeVisible();
      await expect(bar.getByRole("button").last()).toHaveText("Select all");
    });

    test("closes a swiped-open row before an iPhone's long press opens a book's menu", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's context menu");
      await page.clock.install();
      await openSeries(page);
      await swipe(page, 2, SHORT_SWIPE);
      const opened = plateRows(page).nth(2).locator("[data-swipe-action]");
      await expect(opened).toBeVisible();
      const finger = await fingerOn(plateRows(page).nth(1).getByRole("link"));

      await finger.down();
      await page.clock.runFor(LONG_PRESS_MS);

      await expect(page.getByRole("menu")).toBeVisible();
      await expect(opened).toHaveCount(0);
    });

    test("marks nothing when an open capsule is nudged further on the narrowest iPhone at the largest text", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await page.setViewportSize(IPHONE_SE);
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openSeries(page);
      await swipe(page, 0, SHORT_SWIPE);
      await expect(
        plateRows(page).first().locator("[data-swipe-action]"),
      ).toBeVisible();
      const finger = await fingerOn(plateRows(page).first().getByRole("link"));

      await finger.down();
      await finger.moveTo(...NUDGED_ON_PX);
      await finger.liftAt(NUDGED_ON_PX[1]);

      expect(shelf.marked).toEqual([]);
      await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    });

    test("measures an iPhone's swiped action only when the swipe leaves it open", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's swipe capsules");
      await page.addInitScript(() => {
        const measure = window.getComputedStyle.bind(window);
        window.getComputedStyle = (element, pseudo) => {
          if (element.hasAttribute("data-swipe-action")) {
            document.documentElement.dataset.measuredAction = "";
          }
          return measure(element, pseudo);
        };
      });
      await openSeries(page);

      await swipe(page, 2, FULL_SWIPE);

      await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
      await expect(page.locator("html")).not.toHaveAttribute(
        "data-measured-action",
      );
    });

    test("keeps a book's menu shut after an iPhone turns sideways and back", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the iPhone's book menu");
      const upright = viewportOf(page);
      await openSeries(page);
      await bookMore(page, 1).click();
      await expect(page.getByRole("menu")).toBeVisible();

      await page.setViewportSize(SIDEWAYS_IPHONE_MINI);
      await expect(page.getByRole("menu")).toHaveCount(0);
      await page.setViewportSize(upright);

      await expect(bookMore(page, 1)).toBeVisible();
      await expect(page.getByRole("menu")).toHaveCount(0);
    });

    test("keeps today's picking on a tablet", async ({ page, platform }) => {
      await page.setViewportSize(TABLET);
      await openSeries(page);

      await startPickingFrom(page, 1);

      await expect(page.locator("[data-picking-bar]")).toHaveCount(0);
      await expect(navigation(page)).toBeVisible({
        visible: platform !== "ios",
      });
    });
  },
);
