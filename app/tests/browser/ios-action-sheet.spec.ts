import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(4);
const SHEET_WIDTH = 300;
const SHEET_BOTTOM_GAP = 16;
const ACTION_HEIGHT = 48;
const CANCEL_EXTRA_GAP = 8;
const ACTION_GAP = 8;
const NARROW_PHONE = { width: 320, height: 568 } as const;
const SHEET_SIDE_MARGIN = 16;
const TABLET_MIN_WIDTH = 600;

let removed: boolean[] = [];

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...LIBRARY], next: null }),
  librarySeriesCount: () => LIBRARY.length,
  previewRemoval: (targets) => ({
    books: targets.length * 3,
    files: targets.length * 3,
    folders: 2,
  }),
  removeFromLibrary: (targets, deleteFiles) => {
    removed = [...removed, deleteFiles];
    return {
      removedSeries: targets.length,
      removedBooks: targets.length * 3,
      files: [],
    };
  },
};

test.use({ backend: BACKEND });

test.beforeEach(() => {
  removed = [];
});

async function tap(target: Locator): Promise<void> {
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await target.dispatchEvent("pointerup", touch);
  await target.dispatchEvent("click");
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

  test("removes the series when Remove is tapped", async ({ page }) => {
    const sheet = await openRemove(page);

    await tap(sheet.getByRole("button", { name: "Remove" }));

    await expect(sheet).toHaveAttribute("data-state", "closed");
    expect(removed).toEqual([false]);
  });

  test("deletes the files too when the box is ticked and Delete files is tapped", async ({
    page,
  }) => {
    const sheet = await openRemove(page);
    await sheet
      .getByRole("checkbox", { name: "Also delete the files from disk" })
      .dispatchEvent("click");

    await tap(sheet.getByRole("button", { name: "Delete files" }));

    await expect(sheet).toHaveAttribute("data-state", "closed");
    expect(removed).toEqual([true]);
  });

  test("leaves everything alone when Cancel is tapped", async ({ page }) => {
    const sheet = await openRemove(page);

    await tap(sheet.getByRole("button", { name: "Cancel" }));

    await expect(sheet).toHaveAttribute("data-state", "closed");
    expect(removed).toEqual([]);
  });

  test("sets the sheet 16 clear of both edges on the narrowest iPhone", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_PHONE);
    const sheet = await openRemove(page);

    const frame = await boxOf(sheet);
    expect(frame.x).toBeCloseTo(SHEET_SIDE_MARGIN, 0);
    expect(NARROW_PHONE.width - (frame.x + frame.width)).toBeCloseTo(
      SHEET_SIDE_MARGIN,
      0,
    );
  });
});

test.describe("confirmations on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.use({
    backend: { ...BACKEND, appInfo: onPlatform("ios").backend.appInfo },
  });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < TABLET_MIN_WIDTH, "an iPad's width");
  });

  test("keeps Cancel before Remove in the tab order", async ({ page }) => {
    const sheet = await openRemove(page);

    const names = await sheet
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.textContent.trim()),
      );

    expect(names).toEqual(["Cancel", "Remove"]);
  });
});
