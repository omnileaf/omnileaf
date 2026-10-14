import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const ON_PAGE_14 = { state: "started", page: 14 } as const;
const PAGE_COUNT = 192;
const SEARCH_WIDTH = 220;
const ROW_HEIGHT = { phone: 77, desktop: 52 };

function eightBooks(): FakeShelf {
  const shelf = new FakeShelf(
    [READ, READ, ON_PAGE_14, ...Array.from({ length: 5 }, () => NOT_STARTED)],
    {},
    PAGE_COUNT,
  );
  shelf.bookmark(1);
  shelf.bookmark(4);
  shelf.markNew(7);
  return shelf;
}

const shelf = eightBooks();

test.use({ backend: shelf.backend() });

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function rows(page: Page): Locator {
  return isWide(page)
    ? page
        .getByRole("table", { name: "Books" })
        .getByRole("row")
        .filter({ has: page.getByRole("link") })
    : page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

function titleOf(row: Locator, index: number): Locator {
  return row.getByText(shelf.titleOf(index), { exact: true });
}

async function openBooks(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await rows(page).first().scrollIntoViewIfNeeded();
}

test("counts the books read and bookmarked beside the books' heading", async ({
  page,
}) => {
  await openBooks(page);
  const heading = page.getByRole("heading", { level: 2, name: "8 books" });

  if (isWide(page)) {
    await expect(heading).toHaveClass(/sr-only/);
  } else {
    await expect(heading).toBeVisible();
    await expect(page.getByText("2 read · 2 bookmarked")).toBeVisible();
  }
});

test("says how far each book is read and how many pages it has", async ({
  page,
}) => {
  await openBooks(page);

  if (isWide(page)) {
    await expect(rows(page).nth(0)).toContainText("Read");
    await expect(rows(page).nth(0)).toContainText("192");
    await expect(rows(page).nth(2)).toContainText("Page 14 of 192");
    await expect(rows(page).nth(3)).toContainText("Unread");
  } else {
    await expect(rows(page).nth(0)).toContainText("Read · 192 pages");
    await expect(rows(page).nth(2)).toContainText("Page 14 of 192");
    await expect(rows(page).nth(3)).toContainText("Unread · 192 pages");
  }
  await expect(
    rows(page).nth(2).getByRole("progressbar", { name: "Page 14 of 192" }),
  ).toBeVisible();
});

test("marks a bookmarked book and a new one", async ({ page }) => {
  await openBooks(page);
  const row = (index: number): Locator =>
    rows(page).filter({ hasText: shelf.titleOf(index) });

  await expect(row(1).getByRole("img", { name: "Bookmarked" })).toBeVisible();
  await expect(row(0).getByRole("img", { name: "Bookmarked" })).toHaveCount(0);
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: main.scrollHeight });
  });
  await expect(row(7).getByText("New", { exact: true })).toBeVisible();
});

test("shows only the bookmarked books", async ({ page }) => {
  await openBooks(page);

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("radio", { name: "Bookmarked" })
    .click();

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText(shelf.titleOf(1));
  await expect(rows(page).nth(1)).toContainText(shelf.titleOf(4));
});

test("names a read book in muted type and the rest in the foreground", async ({
  page,
}) => {
  await openBooks(page);

  await expect(titleOf(rows(page).nth(0), 0)).toHaveCSS(
    "color",
    await tokenColour(page, "--muted-foreground"),
  );
  await expect(titleOf(rows(page).nth(3), 3)).toHaveCSS(
    "color",
    await tokenColour(page, "--foreground"),
  );
  await expect(titleOf(rows(page).nth(3), 3)).toHaveCSS(
    "font-weight",
    isWide(page) ? "400" : "500",
  );
});

test("sizes the rows as the boards do", async ({ page }) => {
  await openBooks(page);

  const row = await boxOf(rows(page).nth(3));

  expect(row.height).toBe(isWide(page) ? ROW_HEIGHT.desktop : ROW_HEIGHT.phone);
});

test("finds a book from a field beside the show choices on desktops", async ({
  page,
}) => {
  await openBooks(page);
  test.skip(!isWide(page), "phones open the field from a button");

  const field = page.getByRole("searchbox", { name: "Find a book" });

  expect((await boxOf(field.locator(".."))).width).toBe(SEARCH_WIDTH);
  await expect(
    page
      .getByRole("button", { name: "Sort: In order" })
      .getByText("Sort: In order"),
  ).toBeVisible();
});
