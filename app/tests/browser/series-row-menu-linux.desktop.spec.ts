import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const WINDOW = { width: 1280, height: 800 };

let shelf = new FakeShelf([]);
let shownInFolder: string[] = [];

test.beforeEach(() => {
  shownInFolder = [];
  shelf = new FakeShelf(
    Array.from({ length: 4 }, () => ({ state: "notStarted" }) as const),
  );
});

test.use({
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    bookmarkPages: (book, pages, isBookmarked) =>
      shelf.backend().bookmarkPages(book, pages, isBookmarked),
    showBookInFolder: (book) => {
      shownInFolder = [...shownInFolder, book];
      return null;
    },
    previewRemoval: (targets) => ({
      books: targets.length,
      files: targets.length,
      folders: 1,
    }),
  },
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function rowOf(page: Page, index: number) {
  return page.getByRole("row").filter({ hasText: shelf.titleOf(index) });
}

async function openMoreMenu(page: Page, index: number): Promise<void> {
  await openSeries(page);
  await page
    .getByRole("button", { name: `More for ${shelf.titleOf(index)}` })
    .click();
}

async function rightClickRow(page: Page, index: number): Promise<void> {
  await openSeries(page);
  await rowOf(page, index).getByRole("cell").nth(2).click({ button: "right" });
}

const LINUX_ITEMS = [
  /^\s*(Continue|Start) reading/,
  /^\s*Mark read/,
  /^\s*Bookmark/,
  /^\s*Show in folder/,
  /^\s*Delete/,
];

test.describe("a book's row menus on Linux", () => {
  test.use({ platform: "linux" });

  test("lists Bookmark and Show in folder under the ... button", async ({
    page,
  }) => {
    await openMoreMenu(page, 1);

    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(
      LINUX_ITEMS,
    );
  });

  test("opens the same items on a right-click of the row", async ({ page }) => {
    await rightClickRow(page, 1);

    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(
      LINUX_ITEMS,
    );
  });

  test("opens the menu from the keyboard with Shift F10 on a row", async ({
    page,
  }) => {
    await openSeries(page);
    await rowOf(page, 2).getByRole("link").focus();

    await page.keyboard.press("Shift+F10");

    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(
      LINUX_ITEMS,
    );
  });

  test("leaves the row unselected and the page in place on a right-click", async ({
    page,
  }) => {
    await rightClickRow(page, 1);
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(rowOf(page, 1)).toHaveAttribute("aria-selected", "false");
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
  });

  test("still selects a row from its checkbox after a menu was open", async ({
    page,
  }) => {
    await rightClickRow(page, 1);
    await page.keyboard.press("Escape");

    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(1)}` })
      .check();

    await expect(rowOf(page, 1)).toHaveAttribute("aria-selected", "true");
  });

  test("bookmarks the book right-clicked", async ({ page }) => {
    await rightClickRow(page, 2);

    await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();

    await expect
      .poll(() => shelf.bookmarked)
      .toEqual([{ book: shelf.idOf(2), pages: [0], isBookmarked: true }]);
  });

  test("bookmarks the book from the ... button", async ({ page }) => {
    await openMoreMenu(page, 1);

    await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();

    await expect
      .poll(() => shelf.bookmarked)
      .toEqual([{ book: shelf.idOf(1), pages: [0], isBookmarked: true }]);
  });

  test("shows the book right-clicked in its folder", async ({ page }) => {
    await rightClickRow(page, 3);

    await page.getByRole("menuitem", { name: "Show in folder" }).click();

    await expect.poll(() => shownInFolder).toEqual([shelf.idOf(3)]);
  });

  test("shows the book in its folder from the ... button", async ({ page }) => {
    await openMoreMenu(page, 1);

    await page.getByRole("menuitem", { name: "Show in folder" }).click();

    await expect.poll(() => shownInFolder).toEqual([shelf.idOf(1)]);
  });

  test("leaves Bookmark out for a book already bookmarked", async ({
    page,
  }) => {
    shelf.bookmark(1);
    await rightClickRow(page, 1);

    await expect(
      page.getByRole("menuitem", { name: "Mark read", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Bookmark", exact: true }),
    ).toHaveCount(0);
  });

  test("asks before it deletes the book right-clicked", async ({ page }) => {
    await rightClickRow(page, 1);

    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect(
      page.getByRole("alertdialog", { name: "Remove from your library?" }),
    ).toBeVisible();
  });
});

for (const [platform, showLabel] of [
  ["windows", "Show in File Explorer"],
  ["macos", "Show in Finder"],
] as const) {
  test.describe(`a book's row menus on ${platform}`, () => {
    test.use({ platform });

    test("keeps the ... menu it had", async ({ page }) => {
      await openMoreMenu(page, 1);

      await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
        /^\s*(Continue|Start) reading/,
        /^\s*Mark read/,
        /^\s*Bookmark/,
        new RegExp(`^\\s*${showLabel}`),
        /^\s*Delete/,
      ]);
    });

    test("opens no menu on a right-click of the row", async ({ page }) => {
      await rightClickRow(page, 1);

      await expect(page.getByRole("menu")).toHaveCount(0);
    });
  });
}
