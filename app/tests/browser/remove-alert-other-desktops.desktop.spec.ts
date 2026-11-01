import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const MAC_ALERT_WIDTH = 260;
const shelf = new FakeShelf([{ state: "read" }, { state: "notStarted" }]);

testOnlyInItsWebview("linux");
test.use({
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    previewRemoval: (targets) => ({
      books: targets.length,
      files: targets.length,
      folders: 1,
    }),
  },
});

async function openRemove(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(0)}` })
    .click();
  await page
    .getByRole("checkbox", { name: `Select ${shelf.titleOf(1)}` })
    .click();
  await page
    .getByRole("group", { name: "Selected books" })
    .getByRole("button", { name: "Delete" })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("the Remove from library dialog on linux", () => {
  test.use({ platform: "linux" });

  test("keeps its own dialog, without the Mac alert's app icon or width", async ({
    page,
  }) => {
    const dialog = await openRemove(page);

    await expect(dialog.locator("img")).toHaveCount(0);
    expect((await boxOf(dialog)).width).not.toBeCloseTo(MAC_ALERT_WIDTH, 0);
  });

  test("keeps Cancel before Remove", async ({ page }) => {
    const dialog = await openRemove(page);

    const names = await dialog
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.textContent.trim()),
      );

    expect(names).toEqual(["Cancel", "Remove"]);
  });
});
