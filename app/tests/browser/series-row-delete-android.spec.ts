import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { FakeRemoval } from "./series-removal.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const removal = new FakeRemoval();
let shelf = new FakeShelf([]);

test.beforeEach(() => {
  removal.reset();
  shelf = new FakeShelf(
    Array.from({ length: 3 }, () => ({ state: "notStarted" }) as const),
  );
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    ...removal.backend(),
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

async function askToDelete(page: Page, index: number): Promise<Locator> {
  const sheet = await openSheetOf(page, index);
  await sheet.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe(
  "deleting a book from its sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's bottom sheet");
    });

    test("ends the sheet with Delete in the danger colour", async ({
      page,
    }) => {
      const sheet = await openSheetOf(page, 1);

      const actions = sheet.getByRole("button");
      await expect(actions.last()).toHaveText("Delete");
      const colourOf = (item: Locator) =>
        item.evaluate((element) => getComputedStyle(element).color);
      expect(await colourOf(actions.last())).not.toBe(
        await colourOf(actions.first()),
      );
    });

    test("asks first, naming the book that leaves and keeping its file by default", async ({
      page,
    }) => {
      const dialog = await askToDelete(page, 1);

      await expect(dialog).toContainText("1 book leaves your library.");
      await expect(
        dialog.getByRole("checkbox", {
          name: "Also delete the files from disk",
        }),
      ).not.toBeChecked();
      expect(removal.asked).toEqual([]);
    });

    test("removes only that book from the library when the files are left alone", async ({
      page,
    }) => {
      const dialog = await askToDelete(page, 1);

      await dialog.getByRole("button", { name: "Remove" }).click();

      await expect(dialog).toBeHidden();
      expect(removal.asked).toEqual([
        {
          targets: [{ kind: "book", id: shelf.idOf(1) }],
          deleteFiles: false,
        },
      ]);
      await expect(page.getByText("1 book removed")).toBeVisible();
    });

    test("says how many files in how many folders go before it deletes them", async ({
      page,
    }) => {
      const dialog = await askToDelete(page, 1);

      await dialog
        .getByRole("checkbox", { name: "Also delete the files from disk" })
        .check();

      await expect(dialog).toContainText("3 files in 1 folder");
      await dialog.getByRole("button", { name: "Delete files" }).click();
      await expect(dialog).toBeHidden();
      expect(removal.asked[0]?.deleteFiles).toBe(true);
    });

    test("names the files it couldn't delete", async ({ page }) => {
      removal.outcome = "failed";
      const dialog = await askToDelete(page, 1);
      await dialog
        .getByRole("checkbox", { name: "Also delete the files from disk" })
        .check();

      await dialog.getByRole("button", { name: "Delete files" }).click();

      await expect(page.getByText("1 file couldn't be deleted")).toBeVisible();
      await expect(page.getByText("Volume 1.cbz")).toBeVisible();
    });

    test("leaves the book alone when it is cancelled", async ({ page }) => {
      const dialog = await askToDelete(page, 1);

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).toBeHidden();
      expect(removal.asked).toEqual([]);
    });
  },
);
