import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";

const FOLDER: MissingFolder = {
  folder: {
    id: "0190a3e4-0000-7000-8000-0000000000f1" as MissingFolder["folder"]["id"],
    kind: "linked",
    name: "Comics",
    location: "/storage/1A2B-3C4D/Comics",
    isAvailable: false,
  },
  problem: { kind: "driveDisconnected" },
  hiddenSeries: 0,
  isShownAnyway: true,
};

const STARTED_BOOK = 0;
const AWAY_BOOK = 1;

let shelf = new FakeShelf([]);
let shown: string[] = [];

test.beforeEach(() => {
  shelf = new FakeShelf([
    { state: "started", page: 14 },
    { state: "notStarted" },
  ]);
  const away = shelf.books[AWAY_BOOK];
  if (away !== undefined) {
    away.file = { kind: "notConnected" };
  }
  shown = [];
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
    showBookInFolder: (book) => {
      shown.push(book);
      return null;
    },
    bookMissingFolder: (book) => {
      shown.push(`missing ${book}`);
      return FOLDER;
    },
    relocateLibraryFolder: (id) => {
      shown.push(`relocate ${id}`);
      return null;
    },
  },
});

async function openSheetOf(page: Page, index: number): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `More for ${shelf.titleOf(index)}` })
    .click();
  const sheet = page.getByRole("dialog", { name: shelf.titleOf(index) });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("a book's sheet on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's bottom sheet");
  });

  test("offers Mark read and Mark unread for a started book", async ({
    page,
  }) => {
    const sheet = await openSheetOf(page, STARTED_BOOK);

    await sheet.getByRole("button", { name: "Mark unread" }).click();

    await expect
      .poll(() => shelf.marked)
      .toEqual([{ books: [shelf.idOf(STARTED_BOOK)], mark: "unread" }]);
  });

  test("shows the file of a book that is there", async ({ page }) => {
    const sheet = await openSheetOf(page, STARTED_BOOK);

    await sheet.getByRole("button", { name: "Show the file" }).click();

    await expect.poll(() => shown).toEqual([shelf.idOf(STARTED_BOOK)]);
  });

  test("turns Show the file off for a book that isn't connected", async ({
    page,
  }) => {
    const sheet = await openSheetOf(page, AWAY_BOOK);

    await expect(
      sheet.getByRole("button", { name: "Show the file" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  test("puts Find the folder first for a book that isn't connected", async ({
    page,
  }) => {
    const sheet = await openSheetOf(page, AWAY_BOOK);

    await expect(sheet.getByRole("button").first()).toHaveText(
      /^\s*Find the folder$/,
    );
    await sheet.getByRole("button", { name: "Find the folder" }).click();

    await expect
      .poll(() => shown)
      .toEqual([
        `missing ${shelf.idOf(AWAY_BOOK)}`,
        `relocate ${FOLDER.folder.id}`,
      ]);
  });

  test("turns Start reading and Delete off for a book that isn't connected", async ({
    page,
  }) => {
    const sheet = await openSheetOf(page, AWAY_BOOK);

    for (const name of ["Start reading", "Delete"]) {
      await expect(sheet.getByRole("button", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes the accessibility checks in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSheetOf(page, AWAY_BOOK);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
