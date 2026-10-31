import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);

type Asked = {
  targets: Parameters<FakeBackend["removeFromLibrary"]>[0];
  deleteFiles: boolean;
};

let asked: Asked[] = [];
let outcome: "trashed" | "failed" = "trashed";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    librarySeriesCount: () => LIBRARY.length,
    previewRemoval: (targets) => ({
      books: targets.length * 3,
      files: targets.length * 3,
      folders: 2,
    }),
    removeFromLibrary: (targets, deleteFiles) => {
      asked = [...asked, { targets: [...targets], deleteFiles }];
      return {
        removedSeries: targets.length,
        removedBooks: targets.length * 3,
        files: deleteFiles
          ? [
              {
                book: "book-1",
                name: "Volume 1.cbz",
                outcome:
                  outcome === "failed"
                    ? { kind: "failed", reason: "locked" }
                    : { kind: "trashed" },
              },
            ]
          : [],
      };
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  asked = [];
  outcome = "trashed";
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function pickTwo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  const links = seriesList(page).getByRole("link");
  if (test.info().project.use.hasTouch === true) {
    const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
    await links.nth(0).dispatchEvent("pointerdown", touch);
    await page.waitForTimeout(600);
    const first = seriesList(page).getByRole("checkbox").nth(0);
    await first.dispatchEvent("pointerup", touch);
    await first.dispatchEvent("click");
  } else {
    await links.nth(0).click({ modifiers: ["ControlOrMeta"] });
  }
  await seriesList(page).getByRole("checkbox").nth(1).click();
}

async function openDelete(page: Page): Promise<Locator> {
  await page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name: "Delete" })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("asks first, naming what leaves the library and keeping the files by default", async ({
  page,
}) => {
  await pickTwo(page);

  const dialog = await openDelete(page);

  await expect(dialog).toContainText("2 series leave your library.");
  const alsoFiles = dialog.getByRole("checkbox", {
    name: "Also delete the files from disk",
  });
  await expect(alsoFiles).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Remove" })).toBeVisible();
  expect(asked).toEqual([]);
});

test("removes the series from the library only when the files are left ticked off", async ({
  page,
}) => {
  await pickTwo(page);
  const dialog = await openDelete(page);

  await dialog.getByRole("button", { name: "Remove" }).click();

  await expect(dialog).toBeHidden();
  expect(asked).toHaveLength(1);
  expect(asked[0]?.deleteFiles).toBe(false);
  expect(asked[0]?.targets).toHaveLength(2);
  expect(asked[0]?.targets.every(({ kind }) => kind === "series")).toBe(true);
  await expect(
    page.getByRole("group", { name: "Selected series" }),
  ).toBeHidden();
});

test("says how many files in how many folders go before it deletes them", async ({
  page,
}) => {
  await pickTwo(page);
  const dialog = await openDelete(page);

  await dialog
    .getByRole("checkbox", { name: "Also delete the files from disk" })
    .check();

  await expect(dialog).toContainText("6 files in 2 folders");
  await dialog.getByRole("button", { name: "Delete files" }).click();
  await expect(dialog).toBeHidden();
  expect(asked[0]?.deleteFiles).toBe(true);
});

test("names the files it couldn't delete", async ({ page }) => {
  outcome = "failed";
  await pickTwo(page);
  const dialog = await openDelete(page);
  await dialog
    .getByRole("checkbox", { name: "Also delete the files from disk" })
    .check();

  await dialog.getByRole("button", { name: "Delete files" }).click();

  await expect(page.getByText("1 file couldn't be deleted")).toBeVisible();
  await expect(page.getByText("Volume 1.cbz")).toBeVisible();
});

test("leaves everything alone when it is cancelled", async ({ page }) => {
  await pickTwo(page);
  const dialog = await openDelete(page);

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).toBeHidden();
  expect(asked).toEqual([]);
  await expect(
    page.getByRole("group", { name: "Selected series" }),
  ).toBeVisible();
});
