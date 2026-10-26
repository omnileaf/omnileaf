import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGEST_TEXT_SCALE,
  setTextScale,
  test,
  tokenColour,
} from "./fixtures.ts";
import { settleBarTitle } from "./series-bar.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const TABLET = { width: 820, height: 1180 };
const NARROWEST_WINDOW = { width: 200, height: 568 };
const TWO_LINE_ROW = 72;
const BOOK_PAGES = 192;
const CHAPTER_TITLE = "Chapter 148.5";
const VOLUME_TITLE = "Volume 2";
const LONG_BOOK_TITLE =
  "The Lighthouse Keeper's Apprentice Spends Every Winter Writing Letters";

type PhonePlatform = Extract<Platform, "ios" | "android">;

const ANDROID_SHEET_ROW = 56;
const SHORT_SWIPE = 0.25;
const COLOR_SCHEMES = ["light", "dark"] as const;

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
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
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

function bookList(page: Page): Locator {
  return page.getByRole("list", { name: "Books" });
}

function bookRows(page: Page): Locator {
  return bookList(page).getByRole("listitem");
}

function bookMore(page: Page, index: number): Locator {
  return page.getByRole("button", { name: `More for ${shelf.titleOf(index)}` });
}

function showChoices(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Show" });
}

function swipeAction(page: Page, index: number): Locator {
  return bookRows(page)
    .nth(index)
    .getByRole("button", { name: /^Mark (un)?read$/u });
}

async function swipeFrom(target: Locator, across: number): Promise<void> {
  const box = await boxOf(target);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const at = (moved: number) => ({
    pointerType: "touch",
    pointerId: 7,
    isPrimary: true,
    clientX: start.x + moved,
    clientY: start.y,
  });
  await target.dispatchEvent("pointerdown", at(0));
  for (const moved of [across / 4, across / 2, across]) {
    await target.dispatchEvent("pointermove", at(moved));
  }
  await target.dispatchEvent("pointerup", at(across));
}

async function tapByTouch(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

async function swipeLeftMarksRead(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("omnileaf.swipeTowardStart", "markRead");
  });
}

const LONG_SERIES = 40;
const SCROLL_STEPS = 6;
const SCROLL_STEP_PX = 400;
const ROW_SLACK_PX = 1;

function longMixedShelf(): FakeShelf {
  const readings = Array.from({ length: LONG_SERIES }, (_, index) => {
    switch (index % 3) {
      case 0:
        return { state: "read" } as const;
      case 1:
        return { state: "started", page: 14 } as const;
      default:
        return { state: "notStarted" } as const;
    }
  });
  const long = new FakeShelf(readings, {}, BOOK_PAGES);
  for (let index = 4; index < LONG_SERIES; index += 5) {
    long.retitle(index, LONG_BOOK_TITLE);
    long.bookmark(index);
  }
  return long;
}

async function expectEvenRowsWhileScrolling(page: Page): Promise<void> {
  for (let step = 0; step < SCROLL_STEPS; step += 1) {
    await expect.poll(() => unevenRows(page), { timeout: 5_000 }).toEqual([]);
    await page.getByRole("main").evaluate((main, by) => {
      main.scrollBy({ top: by });
    }, SCROLL_STEP_PX);
  }
}

async function unevenRows(page: Page): Promise<string[]> {
  return page.locator("[data-book-plate] li").evaluateAll((rows, slack) => {
    const boxes = rows.map((row) => ({
      at: Number(row.getAttribute("aria-posinset")),
      box: row.getBoundingClientRect(),
    }));
    const [first] = boxes;
    if (first === undefined) {
      return ["no rows drawn"];
    }
    const stride = first.box.height;
    return boxes
      .filter(
        ({ at, box }) =>
          Math.abs(box.height - stride) > slack ||
          Math.abs(box.top - first.box.top - (at - first.at) * stride) > slack,
      )
      .map(({ at, box }) => `${String(at)}: ${String(box.height)}`);
  }, ROW_SLACK_PX);
}

async function linesOf(text: Locator): Promise<number> {
  return text.evaluate((element) => {
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    return Math.round(element.getBoundingClientRect().height / lineHeight);
  });
}

async function isCut(text: Locator): Promise<boolean> {
  return text.evaluate(
    (element) =>
      element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight,
  );
}

function isOnPhone(platform: Platform | undefined): platform is PhonePlatform {
  return platform === "ios" || platform === "android";
}

test.describe("the series' books on a phone", { tag: "@native" }, () => {
  test("sets the books in an inset plate on an iPhone and edge to edge on Android", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }

    await openSeries(page);
    const plate = page.locator("[data-book-plate]");
    const box = await boxOf(plate);
    const row = await boxOf(bookRows(page).nth(1));
    const pageWidth = page.viewportSize()?.width ?? 0;

    expect(row.height).toBeGreaterThanOrEqual(TWO_LINE_ROW);
    if (platform === "ios") {
      expect(box.x).toBeGreaterThan(0);
      await expect(plate).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-group"),
      );
      expect(
        parseFloat(
          await plate.evaluate(
            (element) => getComputedStyle(element).borderTopLeftRadius,
          ),
        ),
      ).toBeGreaterThan(0);
    } else {
      expect(box.x).toBe(0);
      expect(box.width).toBe(pageWidth);
    }
  });

  for (const look of [
    { name: "the default text", scale: undefined },
    { name: "the largest text in a long language", scale: LARGEST_TEXT_SCALE },
  ]) {
    test(`keeps every row the same height as a long series scrolls, at ${look.name}`, async ({
      page,
      platform,
    }) => {
      if (!isOnPhone(platform)) {
        test.skip();
        return;
      }
      shelf = longMixedShelf();
      if (look.scale !== undefined) {
        await page.addInitScript(() => {
          window.localStorage.setItem("omnileaf.language", "en-XA");
        });
        await setTextScale(page, look.scale);
      }
      await page.goto(`/series/${SERIES_ID}`);
      await revealRows(page);

      await expectEvenRowsWhileScrolling(page);
      await page
        .locator("[data-book-plate] li")
        .nth(1)
        .getByRole("button")
        .click();
      await page
        .locator(
          '[role="menuitem"]:has(.lucide-list-checks), [role="dialog"] button:has(.lucide-list-checks)',
        )
        .click();
      await expectEvenRowsWhileScrolling(page);
    });
  }

  for (const look of [
    {
      name: "one line at the default text",
      scale: undefined,
      viewport: undefined,
      lines: 1,
    },
    {
      name: "two lines at the largest text",
      scale: LARGEST_TEXT_SCALE,
      viewport: undefined,
      lines: 2,
    },
    {
      name: "today's one line on a tablet at the largest text",
      scale: LARGEST_TEXT_SCALE,
      viewport: TABLET,
      lines: 1,
    },
  ]) {
    test(`gives every book's title ${look.name}`, async ({
      page,
      platform,
    }) => {
      if (!isOnPhone(platform)) {
        test.skip();
        return;
      }
      shelf.retitle(1, LONG_BOOK_TITLE);
      if (look.viewport !== undefined) {
        await page.setViewportSize(look.viewport);
      }
      if (look.scale !== undefined) {
        await setTextScale(page, look.scale);
      }

      await openSeries(page);
      const long = bookRows(page).nth(1).getByText(LONG_BOOK_TITLE);
      const short = bookRows(page).nth(2).getByText(shelf.titleOf(2));

      await expect.poll(() => linesOf(long)).toBe(look.lines);
      await expect.poll(() => linesOf(short)).toBe(look.lines);
      expect(await isCut(long)).toBe(true);
    });
  }

  test("rings a book's row inside the plate when focused from the keyboard", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }
    await openSeries(page);
    const link = bookRows(page).nth(1).getByRole("link");

    await page.keyboard.press("Tab");
    await link.focus();

    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    expect(
      parseFloat(
        await link.evaluate(
          (element) => getComputedStyle(element).outlineOffset,
        ),
      ),
    ).toBeLessThan(0);
  });

  test("offers the Show choices on the phone's segmented control, with Find and Sort as icons", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }

    await openSeries(page);
    await showChoices(page).getByRole("radio", { name: "Unread" }).click();
    const find = await boxOf(page.getByRole("button", { name: "Find a book" }));
    const sort = await boxOf(page.getByRole("button", { name: /^Sort: / }));

    await expect(
      showChoices(page).getByRole("radio", { name: "Unread" }),
    ).toBeChecked();
    await expect(bookRows(page)).toHaveCount(3);
    expect(find.width).toBeCloseTo(find.height, 0);
    expect(sort.width).toBeCloseTo(sort.height, 0);
  });

  test("folds the Show choices into a pop-up on an iPhone at the largest text", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openSeries(page);
    const popUp = page.getByRole("button", { name: "Show: All" });

    await popUp.click();
    await page.getByRole("menuitemradio", { name: "Unread" }).click();

    await expect(showChoices(page)).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Show: Unread" }),
    ).toBeVisible();
    await expect(bookRows(page)).toHaveCount(3);
  });

  test("wraps the Show choices onto rows on Android at the largest text", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await setTextScale(page, LARGEST_TEXT_SCALE);

    await openSeries(page);
    const all = await boxOf(
      showChoices(page).getByRole("radio", { name: "All" }),
    );
    const unread = await boxOf(
      showChoices(page).getByRole("radio", { name: "Unread" }),
    );

    expect(unread.y).toBeGreaterThan(all.y);
  });

  test("opens a book's More on an iPhone as a menu headed by its page, then the book's own title", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await openSeries(page);

    await bookMore(page, 1).click();
    const menu = page.getByRole("menu");

    await expect(menu).toHaveAccessibleName(
      `Page 14 of ${String(BOOK_PAGES)} ${shelf.titleOf(1)}`,
    );
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Continue reading",
      "Mark read",
      "Select",
    ]);
  });

  test("heads an iPhone's book menu with the series, then the whole volume, when the book's title is only a number", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    shelf.retitle(1, VOLUME_TITLE);
    await openSeries(page);

    await bookMore(page, 1).click();
    const menu = page.getByRole("menu");
    const series = menu.getByText(SERIES_TITLE, { exact: true });
    const volume = menu.getByText(`· ${VOLUME_TITLE}`, { exact: true });

    await expect(menu).toHaveAccessibleName(
      `Page 14 of ${String(BOOK_PAGES)} ${SERIES_TITLE} · ${VOLUME_TITLE}`,
    );
    await expect(series).toHaveCSS("text-overflow", "ellipsis");
    await expect(volume).toHaveCSS("white-space", "nowrap");
    expect((await boxOf(volume)).y).toBeCloseTo((await boxOf(series)).y, 0);
  });

  test("spreads an iPhone's book menu heading across the menu at the largest text, keeping the series in sight", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    shelf.retitle(1, CHAPTER_TITLE);
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openSeries(page);

    await bookMore(page, 1).click();
    const menu = page.getByRole("menu");
    const heading = await boxOf(menu.locator("p"));
    const item = await boxOf(menu.getByRole("menuitem").first());
    const series = await boxOf(menu.getByText(SERIES_TITLE, { exact: true }));

    expect(heading.width).toBeCloseTo(item.width, 0);
    expect(series.width).toBeGreaterThan(0);
  });

  test("opens a book's More on Android as a sheet of rows", async ({
    page,
    platform,
  }) => {
    if (platform !== "android") {
      test.skip();
      return;
    }
    await openSeries(page);

    await bookMore(page, 1).click();
    const sheet = page.getByRole("dialog", { name: shelf.titleOf(1) });
    const markRead = await boxOf(
      sheet.getByRole("button", { name: "Mark read" }),
    );

    await expect(sheet.getByRole("link")).toHaveText("Continue reading");
    expect(markRead.height).toBeCloseTo(ANDROID_SHEET_ROW, 0);
    expect(markRead.width).toBe(page.viewportSize()?.width ?? 0);
  });

  test("starts picking books from Select in a book's More", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }
    await openSeries(page);

    await bookMore(page, 2).click();
    await page
      .getByRole("menuitem", { name: "Select" })
      .or(page.getByRole("dialog").getByRole("button", { name: "Select" }))
      .click();

    await expect(
      page.getByRole("checkbox", { name: `Select ${shelf.titleOf(2)}` }),
    ).toBeChecked();
  });

  test("keeps a long title and its More inside the narrowest window at the largest text", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await page.setViewportSize(NARROWEST_WINDOW);
    await setTextScale(page, LARGEST_TEXT_SCALE);

    await page.goto(`/series/${SERIES_ID}`);
    await page.locator("[data-book-plate]").scrollIntoViewIfNeeded();
    const row = page.locator("[data-book-plate] li").nth(1);
    const more = await boxOf(row.getByRole("button"));
    const link = await boxOf(row.getByRole("link"));

    expect(link.x).toBeGreaterThanOrEqual(0);
    expect(more.x + more.width).toBeLessThanOrEqual(NARROWEST_WINDOW.width);
  });

  test("keeps today's books, Show choices and sheet on a tablet", async ({
    page,
    platform,
  }) => {
    if (!isOnPhone(platform)) {
      test.skip();
      return;
    }
    await page.setViewportSize(TABLET);

    await openSeries(page);
    await bookMore(page, 1).click();

    await expect(page.locator("[data-book-plate]")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Show" }).getByRole("radio"),
    ).toHaveCount(3);
    await expect(
      page.getByRole("dialog", { name: shelf.titleOf(1) }),
    ).toBeVisible();
  });

  test("keeps a book's menu shut when a swipe starts on its More on an iPhone", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await swipeLeftMarksRead(page);
    await openSeries(page);
    const row = await boxOf(bookRows(page).nth(2));

    await swipeFrom(bookMore(page, 2), -row.width * SHORT_SWIPE);

    await expect(swipeAction(page, 2)).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("closes an open row without its menu when its More is tapped on an iPhone", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios") {
      test.skip();
      return;
    }
    await swipeLeftMarksRead(page);
    await openSeries(page);
    const link = bookRows(page).nth(2).getByRole("link");
    await swipeFrom(link, -(await boxOf(link)).width * SHORT_SWIPE);
    await expect(swipeAction(page, 2)).toBeVisible();

    await tapByTouch(bookMore(page, 2));

    await expect(swipeAction(page, 2)).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`has no accessibility violations at rest in the ${colorScheme} theme`, async ({
      page,
      platform,
    }) => {
      if (!isOnPhone(platform)) {
        test.skip();
        return;
      }
      await page.emulateMedia({ colorScheme });

      await openSeries(page);
      await settleBarTitle(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test(`has no accessibility violations with a book's More open in the ${colorScheme} theme`, async ({
      page,
      platform,
    }) => {
      if (!isOnPhone(platform)) {
        test.skip();
        return;
      }
      await page.emulateMedia({ colorScheme });
      await openSeries(page);
      await settleBarTitle(page);

      await bookMore(page, 1).click();
      await expect(
        platform === "ios"
          ? page.getByRole("menu")
          : page.getByRole("dialog", { name: shelf.titleOf(1) }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test(`has no accessibility violations with the folded Show choices open on an iPhone in the ${colorScheme} theme`, async ({
      page,
      platform,
    }) => {
      if (platform !== "ios") {
        test.skip();
        return;
      }
      await page.emulateMedia({ colorScheme });
      await setTextScale(page, LARGEST_TEXT_SCALE);
      await openSeries(page);
      await settleBarTitle(page);

      await page.getByRole("button", { name: "Show: All" }).click();
      await expect(
        page.getByRole("menuitemradio", { name: "Unread" }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
