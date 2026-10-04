import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  LARGE_MIN_WIDTH,
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

const SHELF_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, after) => shelf.backend().seriesBooks(id, after),
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
