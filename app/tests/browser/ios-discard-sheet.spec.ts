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
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [{ name: "Author A", role: "story" }], edited: null },
  tags: { fromFile: ["Seinen", "Sea"], edited: null },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const TYPED_TITLE = "A title typed in the field";
const SHEET_WIDTH = 300;
const SHEET_BOTTOM_GAP = 16;
const ACTION_HEIGHT = 48;
const CANCEL_EXTRA_GAP = 8;
const ACTION_GAP = 8;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => DETAILS,
  editSeriesDetails: () => null,
};

test.use({ backend: BACKEND });

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
}

async function openUnsaved(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit details…" }).click();
  const editor = page.getByRole("dialog", { name: "Edit details" });
  await editor.getByRole("textbox", { name: "Title" }).fill(TYPED_TITLE);
  await tap(editor.getByRole("button", { name: "Close" }));
  const sheet = page.getByRole("alertdialog", {
    name: "Discard your changes?",
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("leaving Edit details on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's action sheet");
  });

  test("asks with an action sheet, Discard in red above Keep editing", async ({
    page,
  }) => {
    const sheet = await openUnsaved(page);
    const discard = sheet.getByRole("button", { name: "Discard" });
    const keep = sheet.getByRole("button", { name: "Keep editing" });

    const frame = await boxOf(sheet);
    const top = await boxOf(discard);
    const bottom = await boxOf(keep);

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
    await expect(discard).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-destructive"),
    );
  });

  test("says what changed in a line, with no card for the series", async ({
    page,
  }) => {
    const sheet = await openUnsaved(page);

    await expect(sheet).toContainText("Title changed");
    await expect(sheet).toContainText(
      "The details stay as they were before you opened Edit details.",
    );
    await expect(sheet.locator("img")).toHaveCount(0);
    await expect(sheet).not.toContainText(SERIES_TITLE);
  });

  test("keeps editing when Keep editing is tapped", async ({ page }) => {
    const sheet = await openUnsaved(page);

    await tap(sheet.getByRole("button", { name: "Keep editing" }));

    await expect(sheet).toBeHidden();
    await expect(
      page
        .getByRole("dialog", { name: "Edit details" })
        .getByRole("textbox", { name: "Title" }),
    ).toHaveValue(TYPED_TITLE);
  });
});
