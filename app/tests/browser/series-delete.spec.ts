import type { Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

type Asked = {
  targets: Parameters<FakeBackend["removeFromLibrary"]>[0];
  deleteFiles: boolean;
};

let asked: Asked[] = [];
let shelf = new FakeShelf([]);

test.beforeEach(() => {
  asked = [];
  shelf = new FakeShelf([
    { state: "read" },
    { state: "notStarted" },
    { state: "notStarted" },
  ]);
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
    previewRemoval: (targets) => ({
      books: targets.length,
      files: targets.length,
      folders: 1,
    }),
    removeFromLibrary: (targets, deleteFiles) => {
      asked = [...asked, { targets: [...targets], deleteFiles }];
      return {
        removedSeries: 0,
        removedBooks: targets.length,
        files: [],
      };
    },
  },
});

async function pickTwoBooks(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  const first = page.getByRole("checkbox", {
    name: `Select ${shelf.titleOf(0)}`,
  });
  const more = page.getByRole("button", {
    name: `More for ${shelf.titleOf(0)}`,
  });
  await expect(first.or(more).first()).toBeVisible();
  if (!(await first.isVisible())) {
    await more.click();
    await page
      .getByRole("dialog", { name: shelf.titleOf(0) })
      .getByRole("button", { name: "Select", exact: true })
      .or(page.getByRole("menuitem", { name: "Select", exact: true }))
      .click();
  } else {
    await first.click();
  }
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(1)}` })
    .click();
}

test("asks before removing the picked books, leaving their files by default", async ({
  page,
}) => {
  await pickTwoBooks(page);

  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Delete" })
    .click();

  const dialog = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(dialog).toContainText("2 books leave your library.");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(dialog).toBeHidden();
  expect(asked).toHaveLength(1);
  expect(asked[0]?.deleteFiles).toBe(false);
  expect(asked[0]?.targets.every(({ kind }) => kind === "book")).toBe(true);
  expect(asked[0]?.targets).toHaveLength(2);
});
