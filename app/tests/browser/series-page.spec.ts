import type { Locator, Page } from "@playwright/test";

import type { BackSwipe, SwipeEdge } from "../../src/lib/ipc/bindings.ts";

import {
  CommandFailure,
  emitFakeEvent,
  type FakeBackend,
  type FakeChannel,
  fakeProtocolRoute,
} from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  LARGE_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  sidewaysOverflow,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOKS_PER_PAGE,
  FakeShelf,
  SERIES_FOLDER,
  SERIES_ID,
  SERIES_TITLE,
} from "./series-shelf.ts";

const LIBRARY_CHANGED = "library-changed";
const JUST_UNDER = 6;
const SWIPED_PAST_HALFWAY = 0.7;
const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const ON_PAGE_15 = { state: "started", page: 15 } as const;

const TWELVE_BOOKS = [
  READ,
  READ,
  READ,
  ON_PAGE_15,
  ...Array.from({ length: 8 }, () => NOT_STARTED),
];

let shelf = new FakeShelf(TWELVE_BOOKS);

test.beforeEach(() => {
  shelf = new FakeShelf(TWELVE_BOOKS);
});

const LISTED_SERIES = {
  id: SERIES_ID,
  title: SERIES_TITLE,
  bookCount: 12,
  unreadCount: 9,
  cover: null,
};

const SHELF_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [LISTED_SERIES], next: null }),
  librarySearch: () => ({ series: [LISTED_SERIES], next: null }),
  librarySearchCount: () => 1,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
};

test.use({ backend: SHELF_BACKEND });

function books(page: Page): Locator {
  return page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await expect(books(page).first()).toBeVisible();
}

test("shows a series' title, folder and how far it has been read", async ({
  page,
}) => {
  await openSeries(page);

  const main = page.getByRole("main");
  await expect(main.getByText("12 books", { exact: true })).toHaveCount(2);
  await expect(main.getByText(SERIES_FOLDER)).toBeVisible();
  await expect(
    main.getByText(`Continue ${shelf.titleOf(3)} at page 15`),
  ).toBeVisible();
  await expect(
    main.getByRole("progressbar", { name: "3 of 12 read" }),
  ).toHaveJSProperty("value", 3);
});

test("opens a book in the reader from its row", async ({ page }) => {
  await openSeries(page);

  await books(page)
    .filter({ hasText: shelf.titleOf(5) })
    .getByRole("link")
    .click();

  await expect(page).toHaveURL(new RegExp(`/read/${shelf.idOf(5)}$`));
});

test("picks a book tapped while picking rather than opening it", async ({
  page,
}) => {
  await openSeries(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();

  await books(page).getByText(shelf.titleOf(5)).click();

  await expect(
    page.getByRole("checkbox", { name: `Select ${shelf.titleOf(5)}` }),
  ).toBeChecked();
  await expect(books(page).getByRole("link")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
});

test("opens no book with the long press that starts picking", async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)),
    "a long press is how a touch screen starts picking",
  );
  await page.clock.install();
  await openSeries(page);
  const row = books(page).getByText(shelf.titleOf(6));
  await row.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await page.clock.runFor(600);
  await row.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });

  await row.dispatchEvent("click");

  await expect(
    page.getByRole("heading", { level: 2, name: "1 selected" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
});

test("opens the book reading goes on from in the reader from the up next line", async ({
  page,
}) => {
  await openSeries(page);

  await page
    .getByRole("link", { name: `Continue ${shelf.titleOf(3)} at page 15` })
    .click();

  await expect(page).toHaveURL(new RegExp(`/read/${shelf.idOf(3)}$`));
});

test("lists the series' books in order with how far each has been read", async ({
  page,
}) => {
  await openSeries(page);

  const rows = books(page);
  await expect(rows.first()).toHaveAttribute("aria-setsize", "12");
  await expect(rows.filter({ hasText: shelf.titleOf(0) })).toHaveAttribute(
    "aria-posinset",
    "1",
  );
  await expect(rows.filter({ hasText: shelf.titleOf(4) })).toHaveAttribute(
    "aria-posinset",
    "5",
  );
  await expect(rows.nth(0)).toContainText("Read");
  await expect(rows.nth(3)).toContainText("Page 15");
  await expect(rows.nth(4)).toContainText(
    isWide(page) ? "Unread" : "Added Sep 21, 2026",
  );
});

test("opens a series from its cover in the library, landing on its heading", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(SERIES_TITLE) })
    .click();

  await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeFocused();
});

test("opens a series found by a search", async ({ page }) => {
  await page.goto("/search?q=sample");

  await page
    .getByRole("listbox", { name: "Series found" })
    .getByRole("option", { name: new RegExp(SERIES_TITLE) })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeFocused();
});

test("says a series isn't in the library once it has gone", async ({
  page,
}) => {
  await page.goto("/series/0190a3e4-0000-8000-8000-0000000000ff");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "This series isn't in your library",
    }),
  ).toBeVisible();
});

test("goes back to the library", async ({ page }) => {
  await openSeries(page);

  await page
    .getByRole("main")
    .getByRole("link", { name: /^(Library|Back to the library)$/ })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
});

test("sets the books beside the series on wide screens and under it on narrow ones", async ({
  page,
}) => {
  await openSeries(page);

  const heading = await boxOf(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  );
  const list = await boxOf(page.getByRole("list", { name: "Books" }));

  if (isWide(page)) {
    expect(list.x).toBeGreaterThan(heading.x + heading.width);
  } else {
    expect(list.y).toBeGreaterThan(heading.y + heading.height);
  }
});

test("spreads the cover's colour from one edge of the page to the other", async ({
  page,
}) => {
  await openSeries(page);

  const main = page.getByRole("main");
  const band = await boxOf(main.locator(":scope > div > [aria-hidden='true']"));
  const area = await boxOf(main);
  const areaWidth = await main.evaluate((element) => element.clientWidth);

  expect({ start: band.x, end: band.x + band.width }).toEqual({
    start: area.x,
    end: area.x + areaWidth,
  });
});

test("marks the books picked read", async ({ page }) => {
  await openSeries(page);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(5)}` })
    .check();
  await expect(
    page.getByRole("heading", { level: 2, name: "2 selected" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark read" })
    .click();

  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Marked 2 books read" }),
  ).toBeAttached();
  expect(shelf.marked).toEqual([
    { books: [shelf.books[4]?.id, shelf.books[5]?.id], mark: "read" },
  ]);
  await expect(books(page).nth(4)).toContainText("Read");
  await expect(
    page.getByRole("progressbar", { name: "5 of 12 read" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("marks the books picked unread", async ({ page }) => {
  await openSeries(page);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(0)}` })
    .check();
  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark unread" })
    .click();

  await expect(
    page.getByRole("progressbar", { name: "2 of 12 read" }),
  ).toBeVisible();
  expect(shelf.marked).toEqual([
    { books: [shelf.books[0]?.id], mark: "unread" },
  ]);
});

test("picks every book in the series, past the ones read so far", async ({
  page,
}) => {
  shelf = new FakeShelf(
    Array.from({ length: BOOKS_PER_PAGE + 5 }, () => NOT_STARTED),
  );
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Select all" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "105 selected" }),
  ).toBeVisible();
});

test("says it is busy picking every book until all are read in, then how many are picked", async ({
  page,
}) => {
  shelf = new FakeShelf(
    Array.from({ length: BOOKS_PER_PAGE + 5 }, () => NOT_STARTED),
  );
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto(`/series/${SERIES_ID}`);
  await expect(books(page).first()).toBeVisible();
  shelf.holdPagesAfterTheFirst(held);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const selectAll = page.getByRole("button", { name: "Select all" });

  await selectAll.click();

  await expect(selectAll).toHaveAttribute("aria-busy", "true");
  release();
  await expect(selectAll).not.toHaveAttribute("aria-busy", "true");
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "105 selected" }),
  ).toBeAttached();
});

function pickedLongSeries(): FakeShelf {
  return new FakeShelf(
    Array.from({ length: BOOKS_PER_PAGE + 5 }, () => NOT_STARTED),
  );
}

async function pickAllBooks(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(books(page).first()).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "105 selected" }),
  ).toBeVisible();
}

test("keeps every book listed after marking a long series read", async ({
  page,
}) => {
  shelf = pickedLongSeries();
  await pickAllBooks(page);

  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark read" })
    .click();

  await expect(
    page.getByRole("progressbar", { name: "105 of 105 read" }),
  ).toBeVisible();
  await expect(books(page).first()).toContainText("Read");
  await expect(books(page).first()).toHaveAttribute("aria-setsize", "105");
});

test("marks every book picked when the library changes while picking", async ({
  page,
}) => {
  shelf = pickedLongSeries();
  await pickAllBooks(page);
  await shelf.backend().markBooks([shelf.idOf(0)], "read");
  await emitFakeEvent(page, LIBRARY_CHANGED);
  await expect(books(page).first()).toContainText("Read");

  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark read" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Marked 105 books read" }),
  ).toBeAttached();
  expect(shelf.marked.at(-1)?.books).toHaveLength(BOOKS_PER_PAGE + 5);
});

test("focuses Select all once picking starts", async ({ page }) => {
  await openSeries(page);

  await page.getByRole("button", { name: "Select", exact: true }).click();

  await expect(page.getByRole("button", { name: "Select all" })).toBeFocused();
});

for (const stop of ["Done", "Escape"] as const) {
  test(`returns focus to Select once picking stops with ${stop}`, async ({
    page,
  }) => {
    await openSeries(page);
    const select = page.getByRole("button", { name: "Select", exact: true });
    await select.click();

    await (stop === "Done"
      ? page.getByRole("button", { name: "Done" }).click()
      : page.keyboard.press("Escape"));

    await expect(select).toBeFocused();
  });
}

test("returns focus to Select once the books picked are marked", async ({
  page,
}) => {
  await openSeries(page);
  const select = page.getByRole("button", { name: "Select", exact: true });
  await select.click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();

  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark read" })
    .click();

  await expect(select).toBeFocused();
});

test("keeps the books picked when Escape closes quick open", async ({
  page,
}) => {
  await openSeries(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();
  await page.keyboard.press("Control+k");
  const quickOpen = page.getByRole("dialog", { name: "Quick open" });
  await expect(quickOpen).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(quickOpen).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 2, name: "1 selected" }),
  ).toBeVisible();
});

test("stops picking books with Done or Escape, with nothing left picked", async ({
  page,
}) => {
  await openSeries(page);
  const select = page.getByRole("button", { name: "Select", exact: true });
  await select.click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();

  await page.getByRole("button", { name: "Done" }).click();
  await select.click();
  const pickedAfterDone = await page
    .getByRole("checkbox", { checked: true })
    .count();
  await page.keyboard.press("Escape");

  expect(pickedAfterDone).toBe(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("picks a run of books with a shift-click on wide screens", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width < LARGE_MIN_WIDTH,
    "picking a run with the shift key is for a mouse and keyboard",
  );
  await openSeries(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();

  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(7)}` })
    .click({ modifiers: ["Shift"] });

  await expect(
    page.getByRole("heading", { level: 2, name: "4 selected" }),
  ).toBeVisible();
});

test("starts picking books with a long press on a touch screen", async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)),
    "a long press is how a touch screen starts picking",
  );
  await page.clock.install();
  await openSeries(page);
  const row = books(page).getByText(shelf.titleOf(6));

  await row.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await page.clock.runFor(600);
  await row.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });
  await row.dispatchEvent("click");

  await expect(
    page.getByRole("checkbox", { name: `Select ${shelf.titleOf(6)}` }),
  ).toBeChecked();
  await expect(
    page.getByRole("heading", { level: 2, name: "1 selected" }),
  ).toBeVisible();
});

test("picks the next book tapped after a long press the screen took over", async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)),
    "a long press is how a touch screen starts picking",
  );
  await page.clock.install();
  await openSeries(page);
  const row = books(page).getByText(shelf.titleOf(6));
  await row.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await page.clock.runFor(600);
  await row.dispatchEvent("pointercancel", {
    pointerType: "touch",
    isPrimary: true,
  });

  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(7)}` })
    .tap();

  await expect(
    page.getByRole("heading", { level: 2, name: "2 selected" }),
  ).toBeVisible();
});

test("shows only the books not read, and the books the other way round", async ({
  page,
}) => {
  await openSeries(page);
  const show = page.getByRole("group", { name: "Show" });

  await show.getByRole("button", { name: "Unread" }).click();

  await expect(show.getByRole("button", { name: "Unread" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(books(page).first()).toHaveAttribute("aria-setsize", "9");
  await expect(books(page).first()).toContainText(shelf.titleOf(3));

  await page
    .getByRole("button", { name: "Order: in order. Change to last first" })
    .click();

  await expect(books(page).first()).toContainText(shelf.titleOf(11));
  await expect(
    page.getByRole("button", { name: "Order: last first. Change to in order" }),
  ).toHaveAttribute("title", "Order: last first. Change to in order");

  await show.getByRole("button", { name: "All" }).click();

  await expect(books(page).first()).toHaveAttribute("aria-setsize", "12");
  await expect(books(page).first()).toContainText(shelf.titleOf(11));
});

test.describe("when marking books fails", () => {
  let reported: string[] = [];
  let overviewsRead = 0;

  test.use({
    backend: {
      ...SHELF_BACKEND,
      seriesOverview: (id) => {
        overviewsRead += 1;
        return shelf.backend().seriesOverview(id);
      },
      markBooks: () => {
        throw new CommandFailure({
          code: "internal",
          message: "something went wrong inside the app",
        });
      },
      offerInterfaceErrorReport: (error) => {
        reported.push(error.message);
        return DEFAULT_BACKEND.offerInterfaceErrorReport(error);
      },
    },
  });

  test.beforeEach(() => {
    reported = [];
    overviewsRead = 0;
  });

  test("reports the failure and reads nothing again", async ({ page }) => {
    await openSeries(page);
    const readBefore = overviewsRead;
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
      .check();

    await page
      .getByRole("group", { name: "Selected books" })
      .getByRole("button", { name: "Mark read" })
      .click();

    await expect(
      page.getByRole("main").getByText("Couldn't mark those books. Try again."),
    ).toBeVisible();
    await expect.poll(() => reported).toHaveLength(1);
    expect(overviewsRead).toBe(readBefore);
  });
});

test("marks every book picked, though another listing leaves some of them out", async ({
  page,
}) => {
  await openSeries(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(0)}` })
    .check();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Unread" })
    .click();
  await expect(books(page).first()).toHaveAttribute("aria-setsize", "9");
  await expect(
    page.getByRole("heading", { level: 2, name: "2 selected" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Mark unread" })
    .click();

  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Marked 2 books unread" }),
  ).toBeAttached();
  expect(shelf.marked).toEqual([
    { books: [shelf.books[0]?.id, shelf.books[4]?.id], mark: "unread" },
  ]);
});

test("keeps the show choices and the order the same size whichever is chosen", async ({
  page,
}) => {
  await openSeries(page);
  const show = page.getByRole("group", { name: "Show" });
  const sizes = async () =>
    Promise.all(
      [
        show.getByRole("button", { name: "All" }),
        show.getByRole("button", { name: "Unread" }),
        page.getByRole("button", {
          name: /^Order: /,
        }),
      ].map(async (control) => {
        const { width, height } = await boxOf(control);
        return { width, height };
      }),
    );
  const before = await sizes();

  await show.getByRole("button", { name: "Unread" }).click();
  await page
    .getByRole("button", { name: "Order: in order. Change to last first" })
    .click();
  await expect(
    page.getByRole("button", { name: "Order: last first. Change to in order" }),
  ).toBeVisible();

  expect(await sizes()).toEqual(before);
});

test("says when every book of the series is read and only unread ones show", async ({
  page,
}) => {
  shelf = new FakeShelf(Array.from({ length: 3 }, () => READ));
  await openSeries(page);

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Unread" })
    .click();

  await expect(
    page.getByRole("main").getByText("Every book in this series is read."),
  ).toBeVisible();
});

test("fits the series page to the screen, picking books or not", async ({
  page,
}) => {
  await openSeries(page);
  const fitsBefore = await sidewaysOverflow(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
    .check();

  const fitsWhilePicking = await sidewaysOverflow(page);

  expect([fitsBefore, fitsWhilePicking]).toEqual([[], []]);
});

test("sets each book's added date on one line of the table", async ({
  page,
}) => {
  test.skip(!isWide(page), "the books show as a table on wide screens");
  await openSeries(page);

  const added = books(page)
    .first()
    .getByText(/^Sep 21, 2026$/);
  const lineHeight = await added.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );

  expect((await boxOf(added)).height).toBeLessThanOrEqual(lineHeight);
});

for (const { platform, statusBar, target } of [
  { platform: "ios", statusBar: 59, target: 44 },
  { platform: "android", statusBar: 24, target: 48 },
] as const) {
  test.describe(`at the top of a phone on ${platform}`, () => {
    test.use({
      backend: {
        ...SHELF_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test.beforeEach(({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "phones pin a bar at the top",
      );
    });

    async function openUnderStatusBar(page: Page): Promise<void> {
      await openSeries(page);
      await page.evaluate((inset) => {
        document.documentElement.style.setProperty(
          "--system-inset-top",
          `${String(inset)}px`,
        );
      }, statusBar);
    }

    function back(page: Page): Locator {
      return page.getByRole("link", { name: "Back to the library" });
    }

    function barTitle(page: Page): Locator {
      return page.getByRole("main").locator("header").getByText(SERIES_TITLE);
    }

    test("keeps the way back pinned below the status bar and shows the title there once the page's title scrolls under it", async ({
      page,
    }) => {
      await openUnderStatusBar(page);
      const atRest = await boxOf(back(page));
      const heading = await boxOf(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      );
      await expect(barTitle(page)).toHaveCSS("opacity", "0");

      await page.getByRole("main").evaluate((main) => {
        main.scrollTo({ top: 600 });
      });

      await expect(barTitle(page)).toHaveCSS("opacity", "1");
      const scrolled = await boxOf(back(page));
      expect(scrolled.y).toBe(atRest.y);
      expect(atRest.y).toBeGreaterThanOrEqual(statusBar);
      expect(atRest.y + atRest.height).toBeLessThanOrEqual(heading.y);
      expect(Math.min(atRest.width, atRest.height)).toBeGreaterThanOrEqual(
        target,
      );
    });

    test("takes the title away again once larger text brings the page's title back out from under the bar", async ({
      page,
    }) => {
      await openSeries(page);
      const heading = page.getByRole("heading", {
        level: 1,
        name: SERIES_TITLE,
      });
      const bar = page.getByRole("main").locator("header");
      const under =
        (await boxOf(heading)).y +
        (await boxOf(heading)).height -
        ((await boxOf(bar)).y + (await boxOf(bar)).height);
      await page.getByRole("main").evaluate((main, by) => {
        main.scrollTo({ top: by });
      }, under + JUST_UNDER);
      await expect(barTitle(page)).toHaveCSS("opacity", "1");

      await page.evaluate(() => {
        document.documentElement.style.setProperty("--text-scale", "2");
      });

      await expect(barTitle(page)).toHaveCSS("opacity", "0");
    });

    test("shows and hides the title at once when motion is reduced", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openSeries(page);

      await expect(barTitle(page)).toHaveCSS("transition-duration", "0s");
    });
  });
}

test.describe("on Android", () => {
  test.use({
    backend: {
      ...SHELF_BACKEND,
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("ends picking books with back, staying on the series, and leaves with back after", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(SERIES_TITLE) })
      .click();
    await expect(books(page).first()).toBeVisible();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
      .check();

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: "12 books" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);

    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("swiping back from the edge on an iPhone", () => {
  let swipes: FakeChannel<BackSwipe> | undefined;
  const allowedEdges: (SwipeEdge | null)[] = [];

  test.use({
    backend: {
      ...SHELF_BACKEND,
      appInfo: onPlatform("ios").backend.appInfo,
      watchBackSwipes: (channel) => {
        swipes = channel;
        return null;
      },
      allowBackSwipe: (edge) => {
        allowedEdges.push(edge);
        return null;
      },
    },
  });

  test.beforeEach(() => {
    swipes = undefined;
    allowedEdges.length = 0;
  });

  async function openFromTheLibrary(page: Page): Promise<void> {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(SERIES_TITLE) })
      .click();
    await expect(books(page).first()).toBeVisible();
  }

  async function swipeBack(): Promise<void> {
    await expect.poll(() => swipes).toBeDefined();
    await swipes?.send({ kind: "moved", progress: SWIPED_PAST_HALFWAY });
    await swipes?.send({
      kind: "released",
      progress: SWIPED_PAST_HALFWAY,
      velocity: 0,
    });
  }

  test("goes back to the library with a swipe from the left edge", async ({
    page,
  }) => {
    await openFromTheLibrary(page);
    await expect.poll(() => allowedEdges.at(-1)).toBe("left");

    await swipeBack();

    await expect(page).toHaveURL(/\/$/);
  });

  test("lets no swipe from the edge reach a book opened in the reader", async ({
    page,
  }) => {
    await openFromTheLibrary(page);
    await expect.poll(() => allowedEdges.at(-1)).toBe("left");

    await books(page)
      .filter({ hasText: shelf.titleOf(5) })
      .getByRole("link")
      .click();

    await expect(page).toHaveURL(new RegExp(`/read/${shelf.idOf(5)}$`));
    await expect.poll(() => allowedEdges.at(-1)).toBeNull();
  });

  test("ends picking books with a swipe back, staying on the series, and leaves with the next", async ({
    page,
  }) => {
    await openFromTheLibrary(page);
    const start = await boxOf(page.getByRole("main"));
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
      .check();

    await swipeBack();

    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await expect
      .poll(async () => (await boxOf(page.getByRole("main"))).x)
      .toBe(start.x);

    await swipeBack();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("on an iPhone", () => {
  const SNUG_GAP = 20;

  test.use({
    backend: { ...SHELF_BACKEND, appInfo: onPlatform("ios").backend.appInfo },
  });

  test("keeps the picked books' actions just above the tab bar", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "the tab bar floats on phones",
    );
    await openSeries(page);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
      .check();

    const actions = await boxOf(
      page.getByRole("group", { name: "Selected books" }),
    );
    const tabBar = await boxOf(page.getByRole("navigation", { name: "Main" }));

    const gap = tabBar.y - (actions.y + actions.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(SNUG_GAP);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the series page has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openSeries(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });

  test(`picking books has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openSeries(page);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(4)}` })
      .check();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("while Screenshot mode is on", () => {
  const COVER = `thumb/v1/${SERIES_ID}/1/1`;
  const STAND_IN = /^Series \d{2,3}$/;
  let coverRequests = 0;

  test.use({
    backend: {
      ...SHELF_BACKEND,
      librarySeries: () => ({
        series: [{ ...LISTED_SERIES, cover: COVER }],
        next: null,
      }),
      seriesOverview: async (id) => ({
        ...(await shelf.backend().seriesOverview(id)),
        cover: COVER,
      }),
    },
  });

  test.beforeEach(async ({ page }) => {
    coverRequests = 0;
    await page.route(fakeProtocolRoute("omni"), (route) => {
      coverRequests += 1;
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
  });

  test("shows the series as the library's stand-in, with no title, folder or cover of its own", async ({
    page,
  }) => {
    await page.goto("/");
    const cover = page
      .getByRole("list", { name: "Series" })
      .getByRole("link")
      .first();
    const standIn = await cover.getByText(STAND_IN).textContent();

    await cover.click();

    await expect(
      page.getByRole("heading", { level: 1, name: standIn ?? "" }),
    ).toBeFocused();
    await expect(books(page).first()).toContainText(
      `${standIn ?? ""} · Book 1`,
    );
    await expect(books(page).nth(3)).toContainText(`${standIn ?? ""} · Book 4`);
    await expect(page.getByRole("main")).toContainText(
      `Continue ${standIn ?? ""} · Book 4 at page 15`,
    );
    await expect(page.getByRole("main")).toContainText("Folder 571");
    const shown = (await page.getByRole("main").textContent()) ?? "";
    expect(shown).not.toContain(SERIES_TITLE);
    expect(shown).not.toContain(SERIES_FOLDER);
    expect(page.url()).not.toContain("Sample");
    expect(coverRequests).toBe(0);
  });
});
