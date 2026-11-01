import type { Locator, Page } from "@playwright/test";

import type { SeriesDetails } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(4);
const SHEET_WIDTH = 300;
const SHEET_BOTTOM_GAP = 16;
const ACTION_HEIGHT = 48;
const CANCEL_EXTRA_GAP = 8;
const ACTION_GAP = 8;

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: "", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...LIBRARY], next: null }),
  librarySeriesCount: () => LIBRARY.length,
  seriesLabels: () => ({
    keepsLabels: true,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
  previewRemoval: (targets) => ({
    books: targets.length * 3,
    files: targets.length * 3,
    folders: 2,
  }),
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => DETAILS,
};

test.use({ backend: BACKEND });

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

async function openDiscard(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit details…" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("A different title");
  await tap(page.getByRole("button", { name: "Close" }));
  const sheet = page.getByRole("alertdialog", {
    name: "Discard your changes?",
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function openRemove(page: Page): Promise<Locator> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem")).toHaveCount(LIBRARY.length);
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await list.getByRole("link").first().dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = list.getByRole("checkbox").first();
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await tap(
    page
      .getByRole("group", { name: "Selected series" })
      .getByRole("button", { name: "Delete" }),
  );
  const sheet = page.getByRole("alertdialog", {
    name: "Remove from your library?",
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function expectActionSheetUnder(
  page: Page,
  sheet: Locator,
  confirm: Locator,
  cancel: Locator,
): Promise<void> {
  const frame = await boxOf(sheet);
  const top = await boxOf(confirm);
  const bottom = await boxOf(cancel);
  expect(frame.width).toBeCloseTo(SHEET_WIDTH, 0);
  expect(viewportOf(page).height - (frame.y + frame.height)).toBeCloseTo(
    SHEET_BOTTOM_GAP,
    0,
  );
  expect(top.height).toBeCloseTo(ACTION_HEIGHT, 0);
  expect(bottom.height).toBeCloseTo(ACTION_HEIGHT, 0);
  expect(bottom.y - (top.y + top.height)).toBeCloseTo(
    ACTION_GAP + CANCEL_EXTRA_GAP,
    0,
  );
  await expect(confirm).toHaveCSS(
    "color",
    await tokenColour(page, "--native-color-on-button-destructive"),
  );
}

test.describe("confirmations on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's action sheet");
  });

  test("asks before discarding with an action sheet, Discard in red above Keep editing", async ({
    page,
  }) => {
    const sheet = await openDiscard(page);

    await expectActionSheetUnder(
      page,
      sheet,
      sheet.getByRole("button", { name: "Discard", exact: true }),
      sheet.getByRole("button", { name: "Keep editing" }),
    );
  });

  test("says what changed in one line, with no card for the series", async ({
    page,
  }) => {
    const sheet = await openDiscard(page);

    await expect(sheet).toContainText(
      "Title changed. The details stay as they were before you opened Edit details.",
    );
    await expect(sheet.getByText(SERIES_TITLE)).toHaveCount(0);
  });

  test("leaves the sheet and the editor when Discard is tapped", async ({
    page,
  }) => {
    const sheet = await openDiscard(page);

    await tap(sheet.getByRole("button", { name: "Discard", exact: true }));

    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`, "u"));
  });

  test("asks before removing from the library with an action sheet, Remove in red above Cancel", async ({
    page,
  }) => {
    const sheet = await openRemove(page);

    await expectActionSheetUnder(
      page,
      sheet,
      sheet.getByRole("button", { name: "Remove" }),
      sheet.getByRole("button", { name: "Cancel" }),
    );
    await expect(
      sheet.getByRole("checkbox", { name: "Also delete the files from disk" }),
    ).not.toBeChecked();
  });

  test("names the files that go once the checkbox is ticked, and the action says so", async ({
    page,
  }) => {
    const sheet = await openRemove(page);

    await sheet
      .getByRole("checkbox", { name: "Also delete the files from disk" })
      .dispatchEvent("click");

    await expect(sheet).toContainText("3 files in 2 folders");
    await expect(
      sheet.getByRole("button", { name: "Delete files" }),
    ).toBeVisible();
  });
});
