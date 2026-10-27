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
  framesPassed,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  sidewaysOverflow,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { settleBarTitle } from "./series-bar.ts";
import {
  BOOKS_PER_PAGE,
  FakeShelf,
  SERIES_FOLDER,
  SERIES_ID,
  SERIES_TITLE,
} from "./series-shelf.ts";

const LIBRARY_CHANGED = "library-changed";
const READING_SAVED = "reading-saved";
const JUST_UNDER = 6;
const SWIPED_PAST_HALFWAY = 0.7;
const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const ON_PAGE_15 = { state: "started", page: 15 } as const;
const CRUMB_GAP = 10;
const ANDROID_TOUCH_TARGET_PX = 48;
const TOUCH_EDGE_SLACK_PX = 0.25;
const SHOW_CHOICES = ["All", "Unread", "Bookmarked"] as const;

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
  language: null,
  hasDownloads: false,
  isAdult: false,
  continuesFrom: null,
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

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function bookTable(page: Page): Locator {
  return page.getByRole("table", { name: "Books" });
}

function books(page: Page): Locator {
  return isWide(page)
    ? bookTable(page)
        .getByRole("row")
        .filter({ has: page.getByRole("link") })
    : page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

async function expectListed(page: Page, count: number): Promise<void> {
  await (isWide(page)
    ? expect(bookTable(page)).toHaveAttribute(
        "aria-rowcount",
        String(count + 1),
      )
    : expect(books(page).first()).toHaveAttribute(
        "aria-setsize",
        String(count),
      ));
}

async function expectListedAt(row: Locator, position: number): Promise<void> {
  const isTableRow = (await row.getAttribute("aria-rowindex")) !== null;
  await (isTableRow
    ? expect(row).toHaveAttribute("aria-rowindex", String(position + 1))
    : expect(row).toHaveAttribute("aria-posinset", String(position)));
}

function selectedBooks(page: Page): Locator {
  return page.getByRole("group", { name: "Selected books" });
}

function bookCheckbox(page: Page, index: number): Locator {
  return page.getByRole("checkbox", { name: `Select ${shelf.titleOf(index)}` });
}

function bookMore(page: Page, index: number): Locator {
  return page.getByRole("button", { name: `More for ${shelf.titleOf(index)}` });
}

async function startPickingFrom(page: Page, index: number): Promise<void> {
  await bookMore(page, index).click();
  await page
    .getByRole("dialog", { name: shelf.titleOf(index) })
    .getByRole("button", { name: "Select", exact: true })
    .click();
}

async function startPicking(page: Page): Promise<void> {
  if (!isWide(page)) {
    await startPickingFrom(page, 0);
  }
}

async function pickBooks(page: Page, ...indexes: number[]): Promise<void> {
  const [first, ...rest] = indexes;
  if (first === undefined) {
    return;
  }
  if (isWide(page)) {
    await bookCheckbox(page, first).check();
  } else {
    await startPickingFrom(page, first);
  }
  for (const index of rest) {
    await bookCheckbox(page, index).check();
  }
}

function selectAllControl(page: Page): Locator {
  return isWide(page)
    ? bookTable(page).getByRole("checkbox", { name: "Select all" })
    : page.getByRole("button", { name: "Select all" });
}

function shown(page: Page, name: string): Locator {
  return page
    .getByRole("group", { name: "Show" })
    .getByRole("radio", { name, exact: true });
}

async function edgesMissedWithin(
  segment: Locator,
  target: number,
): Promise<string[]> {
  await segment.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  await framesPassed(segment.page());
  return segment.evaluate(
    (element, reach) => {
      const box = element.getBoundingClientRect();
      const centreX = box.left + box.width / 2;
      const centreY = box.top + box.height / 2;
      const edges = {
        left: [centreX - reach, centreY],
        right: [centreX + reach, centreY],
        top: [centreX, centreY - reach],
        bottom: [centreX, centreY + reach],
      } as const;
      return Object.entries(edges)
        .filter(
          ([, [x, y]]) =>
            document.elementFromPoint(x, y)?.closest("[role=radio]") !==
            element,
        )
        .map(([edge]) => edge);
    },
    target / 2 - TOUCH_EDGE_SLACK_PX,
  );
}

async function fitPhoneToShowRow(page: Page): Promise<void> {
  const spare = await page
    .getByRole("group", { name: "Show" })
    .evaluate((group) =>
      [...group.children].reduce((room, segment) => {
        const alone = segment.cloneNode(true);
        if (!(alone instanceof HTMLElement)) {
          throw new Error("a Show segment is not an element");
        }
        alone.style.position = "absolute";
        group.append(alone);
        const natural = alone.getBoundingClientRect().width;
        alone.remove();
        const { marginInlineStart, marginInlineEnd } =
          getComputedStyle(segment);
        return (
          room -
          natural -
          Number.parseFloat(marginInlineStart) -
          Number.parseFloat(marginInlineEnd)
        );
      }, group.clientWidth),
    );
  const viewport = viewportOf(page);
  await page.setViewportSize({
    ...viewport,
    width: viewport.width - Math.floor(spare),
  });
}

async function revealSearch(page: Page): Promise<void> {
  const reveal = page.getByRole("button", { name: "Find a book" });
  if (await reveal.isVisible()) {
    await reveal.click();
  }
}

function sortButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Sort: / });
}

async function sortBy(page: Page, order: string): Promise<void> {
  await sortButton(page).click();
  await page.getByRole("menuitemradio", { name: order }).click();
}

async function expectPicked(page: Page, count: number): Promise<void> {
  await (isWide(page)
    ? expect(selectedBooks(page)).toContainText(
        `${String(count)} ${count === 1 ? "book" : "books"}`,
      )
    : expect(
        page.getByRole("heading", {
          level: 2,
          name: `${String(count)} selected`,
        }),
      ).toBeVisible());
}

function markAllButton(page: Page, mark: "read" | "unread"): Locator {
  return page
    .getByRole("region", { name: "About this series" })
    .getByRole("button", {
      name: new RegExp(`^Mark (${SERIES_TITLE} )?${mark}$`),
    });
}

async function revealBooks(page: Page): Promise<void> {
  await expect(books(page).first()).toBeVisible();
  await books(page)
    .first()
    .evaluate((row) => {
      const bar = document.querySelector("[data-page-toolbar], main header");
      const below = bar?.getBoundingClientRect().bottom ?? 0;
      row.closest("main")?.scrollBy({
        top: row.getBoundingClientRect().top - below,
      });
    });
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await revealBooks(page);
}

async function openSeriesAtTop(page: Page): Promise<void> {
  await openSeries(page);
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: 0 });
  });
}

test("shows a series' title, folder and how far it has been read", async ({
  page,
}) => {
  await openSeries(page);

  const main = page.getByRole("main");
  await expect(main.getByText("12 books", { exact: true })).toHaveCount(2);
  await expect(main.getByText(SERIES_FOLDER)).toBeVisible();
  await expect(
    main.getByRole("link", { name: `Continue ${shelf.titleOf(3)} at page 15` }),
  ).toBeVisible();
  await expect(
    main.getByRole("progressbar", { name: "3 of 12 read" }),
  ).toHaveAttribute("aria-valuenow", "3");
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
  test.skip(isWide(page), "a table keeps its checkboxes beside the links");
  await openSeries(page);
  await startPicking(page);

  await books(page).getByText(shelf.titleOf(5)).click();

  await expect(
    page.getByRole("checkbox", { name: `Select ${shelf.titleOf(5)}` }),
  ).toBeChecked();
  await expect(books(page).getByRole("link")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
});

test("picks a book with the space key", async ({ page }) => {
  await openSeries(page);
  await startPicking(page);

  await bookCheckbox(page, 5).press("Space");

  await expect(bookCheckbox(page, 5)).toBeChecked();
  await expectPicked(page, isWide(page) ? 1 : 2);
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

test("shows how far a book is read once a page turned in it is saved", async ({
  page,
}) => {
  await openSeries(page);
  shelf.readTo(3, 22);

  await emitFakeEvent(page, READING_SAVED, {
    book: shelf.idOf(3),
    series: SERIES_ID,
  });

  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: `Continue ${shelf.titleOf(3)} at page 22` }),
  ).toBeVisible();
  await expect(books(page).nth(3)).toContainText("Page 22");
});

test("lists the series' books in order with how far each has been read", async ({
  page,
}) => {
  await openSeries(page);

  const rows = books(page);
  await expectListed(page, 12);
  await expectListedAt(rows.filter({ hasText: shelf.titleOf(0) }), 1);
  await expectListedAt(rows.filter({ hasText: shelf.titleOf(4) }), 5);
  await expect(rows.nth(0)).toContainText("Read");
  await expect(rows.nth(3)).toContainText("Page 15");
  await expect(rows.nth(4)).toContainText("Unread");
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
  const list = await boxOf(
    isWide(page) ? bookTable(page) : page.getByRole("list", { name: "Books" }),
  );

  if (isWide(page)) {
    expect(list.x).toBeGreaterThan(heading.x + heading.width);
  } else {
    expect(list.y).toBeGreaterThan(heading.y + heading.height);
  }
});

test("fades the cover's colour out before the series' title", async ({
  page,
}) => {
  await openSeries(page);

  const band = await boxOf(page.locator("[data-series-band]"));
  const title = await boxOf(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  );

  expect(band.y + band.height).toBeLessThanOrEqual(title.y);
});

test("sets the breadcrumb's chevron 10px from the Library link and from the series' name", async ({
  page,
}) => {
  test.skip(!isWide(page), "narrower windows show a back button");
  await openSeries(page);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });

  const library = await boxOf(crumbs.getByRole("link", { name: "Library" }));
  const chevron = await boxOf(crumbs.locator("svg"));
  const name = await boxOf(crumbs.getByText(SERIES_TITLE));

  expect(chevron.x - (library.x + library.width)).toBeCloseTo(CRUMB_GAP, 0);
  expect(name.x - (chevron.x + chevron.width)).toBeCloseTo(CRUMB_GAP, 0);
});

test("draws a book's More button in the foreground colour", async ({
  page,
}) => {
  await openSeries(page);

  const more = bookMore(page, 0);

  await expect(more).toHaveCSS(
    "color",
    await tokenColour(page, "--color-foreground"),
  );
});

test("marks every book of the series read, and back with Undo", async ({
  page,
}) => {
  await openSeries(page);

  await markAllButton(page, "read").click();

  await expect(
    page.getByRole("progressbar", { name: "12 of 12 read" }),
  ).toBeVisible();
  expect(shelf.marked).toEqual([
    {
      books: shelf.books.slice(3).map(({ id }) => id),
      mark: "read",
    },
  ]);
  await expect(markAllButton(page, "unread")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(
    page.getByRole("progressbar", { name: "3 of 12 read" }),
  ).toBeVisible();
  expect(shelf.marked.at(-1)).toEqual({
    books: shelf.books.slice(3).map(({ id }) => id),
    mark: "unread",
  });
});

test("marks the books picked read", async ({ page }) => {
  await openSeries(page);

  await pickBooks(page, 4, 5);
  await expectPicked(page, 2);
  await selectedBooks(page).getByRole("button", { name: "Mark read" }).click();

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
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
});

test("marks the books picked unread", async ({ page }) => {
  await openSeries(page);

  await pickBooks(page, 0);
  await selectedBooks(page)
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

  await startPicking(page);
  await selectAllControl(page).click();

  await expectPicked(page, 105);
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
  await startPicking(page);
  const selectAll = selectAllControl(page);

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
  await startPicking(page);
  await selectAllControl(page).click();
  await expectPicked(page, 105);
}

test("keeps every book listed after marking a long series read", async ({
  page,
}) => {
  shelf = pickedLongSeries();
  await pickAllBooks(page);

  await selectedBooks(page).getByRole("button", { name: "Mark read" }).click();

  await expect(
    page.getByRole("progressbar", { name: "105 of 105 read" }),
  ).toBeVisible();
  await expect(books(page).first()).toContainText("Read");
  await expectListed(page, 105);
});

test("marks every book picked when the library changes while picking", async ({
  page,
}) => {
  shelf = pickedLongSeries();
  await pickAllBooks(page);
  await shelf.backend().markBooks([shelf.idOf(0)], "read");
  await emitFakeEvent(page, LIBRARY_CHANGED);
  await expect(books(page).first()).toContainText("Read");

  await selectedBooks(page).getByRole("button", { name: "Mark read" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Marked 105 books read" }),
  ).toBeAttached();
  expect(shelf.marked.at(-1)?.books).toHaveLength(BOOKS_PER_PAGE + 5);
});

test("focuses the books' heading once picking starts from a book's actions", async ({
  page,
}) => {
  test.skip(isWide(page), "a table has no picking to start");
  await openSeries(page);

  await startPicking(page);

  await expect(
    page.getByRole("heading", { level: 2, name: "1 selected" }),
  ).toBeFocused();
});

for (const stop of ["Clear the selection", "Escape"] as const) {
  test(`returns focus to the books' heading once picking stops with ${stop}`, async ({
    page,
  }) => {
    test.skip(isWide(page), "a table has no picking to stop");
    await openSeries(page);
    await startPicking(page);

    await (stop === "Escape"
      ? page.keyboard.press("Escape")
      : page.getByRole("button", { name: stop }).click());

    await expect(
      page.getByRole("heading", { level: 2, name: "12 books" }),
    ).toBeFocused();
  });
}

test("returns focus to where picking starts once the books picked are marked", async ({
  page,
}) => {
  await openSeries(page);
  const start = isWide(page)
    ? selectAllControl(page)
    : page.getByRole("heading", { level: 2, name: "12 books" });
  await pickBooks(page, 4);

  await selectedBooks(page).getByRole("button", { name: "Mark read" }).click();

  await expect(start).toBeFocused();
});

test("keeps the books picked when Escape closes quick open", async ({
  page,
}) => {
  await openSeries(page);
  await pickBooks(page, 4);
  await page.keyboard.press("Control+k");
  const quickOpen = page.getByRole("dialog", { name: "Quick open" });
  await expect(quickOpen).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(quickOpen).toBeHidden();
  await expectPicked(page, 1);
});

test("stops picking books from the clear button or Escape, with nothing left picked", async ({
  page,
}) => {
  test.skip(isWide(page), "a table has no picking to stop");
  await openSeries(page);
  await pickBooks(page, 4, 5);

  await page.getByRole("button", { name: "Clear the selection" }).click();
  const leftAfterClearing = await page.getByRole("checkbox").count();
  await pickBooks(page, 6);
  await page.keyboard.press("Escape");

  expect(leftAfterClearing).toBe(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("picks a run of books with a shift-click on wide screens, selecting no text", async ({
  page,
}) => {
  test.skip(
    !isWide(page),
    "picking a run with the shift key is for a mouse and keyboard",
  );
  await openSeries(page);
  await page.getByRole("heading", { level: 1, name: SERIES_TITLE }).click();

  await bookCheckbox(page, 4).click();
  await bookCheckbox(page, 7).click({ modifiers: ["Shift"] });

  await expectPicked(page, 4);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
});

test.describe("in the table on wide screens", () => {
  test.beforeEach(({ page }) => {
    test.skip(!isWide(page), "the books show as a table on wide screens");
  });

  function rowMenu(page: Page, index: number): Locator {
    return page.getByRole("button", {
      name: `More for ${shelf.titleOf(index)}`,
    });
  }

  test("keeps a checkbox on every book, with no picking to start", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(bookTable(page).getByRole("checkbox")).toHaveCount(13);
    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveCount(0);
  });

  test("picks every book from the heading's checkbox, which shows a dash while only some are", async ({
    page,
  }) => {
    await openSeries(page);
    const selectAll = selectAllControl(page);
    await bookCheckbox(page, 2).check();
    const withOne = await selectAll.getAttribute("aria-checked");

    await selectAll.click();

    expect(withOne).toBe("mixed");
    await expect(selectAll).toHaveAttribute("aria-checked", "true");
    await expectPicked(page, 12);
  });

  test("picks every book with Ctrl+A and lets them go with Escape", async ({
    page,
  }) => {
    await openSeries(page);
    await page.getByRole("heading", { level: 1, name: SERIES_TITLE }).click();

    await page.keyboard.press("Control+a");
    await expectPicked(page, 12);
    await page.keyboard.press("Escape");

    await expect(selectedBooks(page)).toHaveCount(0);
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  });

  test("keeps a picked book's title as strong as an unread one's, read or not", async ({
    page,
  }) => {
    await openSeries(page);
    const unread = books(page).nth(5).getByRole("link");
    const read = books(page).nth(0).getByRole("link");

    await bookCheckbox(page, 0).check();

    await expect(books(page).nth(0)).toHaveAttribute("aria-selected", "true");
    expect(await read.evaluate((link) => getComputedStyle(link).color)).toBe(
      await unread.evaluate((link) => getComputedStyle(link).color),
    );
  });

  test("lets go of the books picked from the selection bar", async ({
    page,
  }) => {
    await openSeries(page);
    await pickBooks(page, 4, 5);

    await selectedBooks(page)
      .getByRole("button", { name: "Clear the selection" })
      .click();

    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  });

  test("names the selection bar's clear button by the Esc key it shows", async ({
    page,
  }) => {
    await openSeries(page);
    await pickBooks(page, 4);

    const clear = selectedBooks(page).getByRole("button").last();

    await expect(clear).toHaveAccessibleName("Esc, clear the selection");
  });

  test("floats the selection bar inside the table's edges", async ({
    page,
  }) => {
    await openSeries(page);
    await pickBooks(page, 4);

    const bar = await boxOf(selectedBooks(page));
    const table = await boxOf(bookTable(page));

    expect(bar.x).toBeGreaterThan(table.x);
    expect(bar.x + bar.width).toBeLessThan(table.x + table.width);
    expect(bar.y + bar.height).toBeLessThan(viewportOf(page).height);
  });

  test("marks a book read from its menu", async ({ page }) => {
    await openSeries(page);

    await rowMenu(page, 5).click();
    await page.getByRole("menuitem", { name: "Mark read" }).click();

    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
    await expect(books(page).nth(5)).toContainText("Read");
  });

  test("offers to mark a read book unread, and to read it from its menu", async ({
    page,
  }) => {
    await openSeries(page);

    await rowMenu(page, 0).click();

    await expect(page.getByRole("menuitem")).toHaveText([
      "Start reading",
      "Mark unread",
    ]);
    await page.getByRole("menuitem", { name: "Start reading" }).click();
    await expect(page).toHaveURL(new RegExp(`/read/${shelf.idOf(0)}$`));
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a book's menu and the selection bar have no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSeries(page);
      await pickBooks(page, 0, 4);
      await rowMenu(page, 3).click();
      await expect(page.getByRole("menu")).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("in the list on narrower screens", () => {
  test.beforeEach(({ page }) => {
    test.skip(isWide(page), "the books show as a list below wide screens");
  });

  function sheet(page: Page, index: number): Locator {
    return page.getByRole("dialog", { name: shelf.titleOf(index) });
  }

  test("leaves picking to a long press or a book's actions, with no Select button", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(
      page.getByRole("button", { name: "Select", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });

  test("offers what can be done to a book in a sheet from its actions", async ({
    page,
  }) => {
    await openSeries(page);

    await bookMore(page, 3).click();

    await expect(sheet(page, 3).getByRole("link")).toHaveText(
      "Continue reading",
    );
    await expect(sheet(page, 3).getByRole("button")).toHaveText([
      "Mark read",
      "Select",
    ]);
  });

  test("marks a book read from its sheet", async ({ page }) => {
    await openSeries(page);
    await bookMore(page, 5).click();

    await sheet(page, 5).getByRole("button", { name: "Mark read" }).click();

    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
    await expect(sheet(page, 5)).toBeHidden();
    await expect(books(page).nth(5)).toContainText("Read");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a book's sheet has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSeries(page);
      await bookMore(page, 3).click();
      await expect(sheet(page, 3)).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("swiping a book in the list", () => {
  const FULL_SWIPE = 0.75;
  const SHORT_SWIPE = 0.25;

  test.beforeEach(({ page }) => {
    test.skip(isWide(page), "books swipe in the list below wide screens");
  });

  async function swipe(page: Page, index: number, share: number) {
    const link = books(page).nth(index).getByRole("link");
    const box = await boxOf(link);
    const across = box.width * share;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const at = (moved: number) => ({
      pointerType: "touch",
      pointerId: 7,
      isPrimary: true,
      clientX: start.x + moved,
      clientY: start.y,
    });
    await link.dispatchEvent("pointerdown", at(0));
    for (const moved of [across / 4, across / 2, across]) {
      await link.dispatchEvent("pointermove", at(moved));
    }
    await link.dispatchEvent("pointerup", at(across));
  }

  test("marks a book read with a full swipe right, and back with Undo", async ({
    page,
  }) => {
    await openSeries(page);

    await swipe(page, 5, FULL_SWIPE);

    await expect(books(page).nth(5)).toContainText("Read");
    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await page.getByRole("button", { name: "Undo" }).click();
    expect(shelf.marked.at(-1)).toEqual({
      books: [shelf.idOf(5)],
      mark: "unread",
    });
  });

  test("marks a read book unread with a full swipe right", async ({ page }) => {
    await openSeries(page);

    await swipe(page, 0, FULL_SWIPE);

    expect(shelf.marked).toEqual([{ books: [shelf.idOf(0)], mark: "unread" }]);
  });

  test("reveals the action of a short swipe, to tap", async ({ page }) => {
    await openSeries(page);

    await swipe(page, 5, SHORT_SWIPE);
    expect(shelf.marked).toEqual([]);
    await books(page).nth(5).getByRole("button", { name: "Mark read" }).click();

    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
  });

  test("does nothing on a swipe left until Settings › Reader asks it to mark read", async ({
    page,
  }) => {
    await openSeries(page);
    await swipe(page, 5, -FULL_SWIPE);
    const markedBefore = shelf.marked.length;
    await page.goto("/settings/reading");
    await page
      .getByRole("radiogroup", { name: "Swipe left" })
      .getByRole("radio", { name: "Mark read" })
      .click();
    await openSeries(page);

    await swipe(page, 5, -FULL_SWIPE);

    expect(markedBefore).toBe(0);
    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
  });

  test("mirrors the swipes in right-to-left text", async ({ page }) => {
    await openSeries(page);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    await swipe(page, 5, -FULL_SWIPE);

    expect(shelf.marked).toEqual([{ books: [shelf.idOf(5)], mark: "read" }]);
  });

  test("moves a swiped book without sliding when motion is reduced", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSeries(page);

    await swipe(page, 5, SHORT_SWIPE);

    await expect(books(page).nth(5).locator("[data-swiped]")).toHaveCSS(
      "transition-duration",
      "0s",
    );
  });
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

  await bookCheckbox(page, 5).tap();

  await expect(
    page.getByRole("heading", { level: 2, name: "2 selected" }),
  ).toBeVisible();
});

test("shows only the books not read, and the books the other way round", async ({
  page,
}) => {
  await openSeries(page);

  await shown(page, "Unread").click();

  await expect(shown(page, "Unread")).toBeChecked();
  await expectListed(page, 9);
  await expect(books(page).first()).toContainText(shelf.titleOf(3));

  await sortBy(page, "Last first");

  await expect(books(page).first()).toContainText(shelf.titleOf(11));
  await expect(sortButton(page)).toHaveAccessibleName("Sort: Last first");

  await shown(page, "All").click();

  await expectListed(page, 12);
  await expect(books(page).first()).toContainText(shelf.titleOf(11));
});

test("finds a book by its title, past the books read in so far", async ({
  page,
}) => {
  shelf = new FakeShelf(
    Array.from({ length: BOOKS_PER_PAGE + 5 }, () => NOT_STARTED),
  );
  await openSeries(page);
  await revealSearch(page);

  await page
    .getByRole("searchbox", { name: "Find a book" })
    .fill(`v${String(BOOKS_PER_PAGE + 3)}`);

  await expect(books(page)).toHaveCount(1);
  await expect(books(page).first()).toContainText(
    shelf.titleOf(BOOKS_PER_PAGE + 2),
  );
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
    await pickBooks(page, 4);

    await selectedBooks(page)
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
  await pickBooks(page, 0, 4);

  await shown(page, "Unread").click();
  await expectListed(page, 9);
  await expectPicked(page, 2);
  await selectedBooks(page)
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
  const sizes = async () =>
    Promise.all(
      [shown(page, "All"), shown(page, "Unread"), sortButton(page)].map(
        async (control) => {
          const { width, height } = await boxOf(control);
          return { width, height };
        },
      ),
    );
  const before = await sizes();

  await shown(page, "Unread").click();
  await sortBy(page, "Last first");
  await expect(sortButton(page)).toHaveAccessibleName("Sort: Last first");

  expect(await sizes()).toEqual(before);
});

test("says when every book of the series is read and only unread ones show", async ({
  page,
}) => {
  shelf = new FakeShelf(Array.from({ length: 3 }, () => READ));
  await openSeries(page);

  await shown(page, "Unread").click();

  await expect(
    page.getByRole("main").getByText("Every book in this series is read."),
  ).toBeVisible();
});

test("fits the series page to the screen, picking books or not", async ({
  page,
}) => {
  await openSeries(page);
  const fitsBefore = await sidewaysOverflow(page);
  await pickBooks(page, 4);

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
      await openSeriesAtTop(page);
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
      await openSeriesAtTop(page);
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
        main.style.overflowAnchor = "none";
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
      await openSeriesAtTop(page);

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

  test("gives each Show segment a 48 dp target while drawing All as wide as its name", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "only a phone draws All narrower than a touch",
    );
    await openSeries(page);
    await fitPhoneToShowRow(page);

    const missed = await Promise.all(
      SHOW_CHOICES.map(async (name) => ({
        name,
        missed: await edgesMissedWithin(
          shown(page, name),
          ANDROID_TOUCH_TARGET_PX,
        ),
      })),
    );

    expect(missed).toEqual(SHOW_CHOICES.map((name) => ({ name, missed: [] })));
    expect((await boxOf(shown(page, "All"))).width).toBeLessThan(
      ANDROID_TOUCH_TARGET_PX,
    );
  });

  test("lets the selected books bar take a touch over the All segment scrolled under it", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "the selected books bar reaches over All only on a phone",
    );
    await openSeries(page);
    await pickBooks(page, 4);
    const barTop = (await boxOf(selectedBooks(page))).y;

    const all = shown(page, "All");
    await all.evaluate((segment, top) => {
      segment.closest("main")?.scrollBy({
        top: segment.getBoundingClientRect().top - top - 1,
      });
    }, barTop);
    await framesPassed(page);
    const touched = await all.evaluate((segment) => {
      const box = segment.getBoundingClientRect();
      return document
        .elementFromPoint(box.left + box.width / 2, box.top + 1)
        ?.closest("[role=group]")
        ?.getAttribute("aria-label");
    });

    expect(touched).toBe("Selected books");
  });

  test("lays its cards on the raised surface with no edge, as Material 3 does", async ({
    page,
  }) => {
    await openSeries(page);

    const card = page.getByRole("region", { name: "Continue", exact: true });

    await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await expect(card).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-card"),
    );
  });

  test("ends picking books with back, staying on the series, and leaves with back after", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(SERIES_TITLE) })
      .click();
    await revealBooks(page);
    await pickBooks(page, 4);

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: "12 books" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);

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
    await revealBooks(page);
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
    await pickBooks(page, 4);

    await swipeBack();

    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
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
    await pickBooks(page, 4);

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
    await settleBarTitle(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });

  test(`picking books has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openSeries(page);
    await pickBooks(page, 4);
    await settleBarTitle(page);

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
    await revealBooks(page);
    await expect(books(page).first()).toContainText("Book 1");
    await expect(books(page).nth(3)).toContainText("Book 4");
    await expect(
      page.getByRole("main").getByRole("link", {
        name: "Continue Book 4 at page 15",
      }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Folder 571");
    const shown = (await page.getByRole("main").textContent()) ?? "";
    expect(shown).not.toContain(SERIES_TITLE);
    expect(shown).not.toContain(SERIES_FOLDER);
    expect(page.url()).not.toContain("Sample");
    expect(coverRequests).toBe(0);
  });
});
