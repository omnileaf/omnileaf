import type { Locator, Page } from "@playwright/test";

import type { BackSwipe } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  selectByLongPress,
  settle,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const PHONE = { width: 412, height: 700 };
const LIBRARY = sampleSeries(6);
const SCREEN_CORNER_PX = 32;
const HALFWAY = 0.5;
const PREVIEW_PROGRESS = 0.6;
const SHELF = new FakeShelf([{ state: "notStarted" }, { state: "notStarted" }]);
let gestures: FakeChannel<BackSwipe> | undefined;

test.use({
  platform: "android",
  viewport: PHONE,
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
    seriesOverview: (id) => SHELF.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      SHELF.backend().seriesBooks(id, listing, after),
    watchBackSwipes: (channel) => {
      gestures = channel;
      return null;
    },
  },
});

test.beforeEach(() => {
  gestures = undefined;
});

async function gesture(step: BackSwipe): Promise<void> {
  await expect.poll(() => gestures).toBeDefined();
  await gestures?.send(step);
}

function started(): BackSwipe {
  return {
    kind: "started",
    progress: 0,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

function moved(progress: number): BackSwipe {
  return {
    kind: "moved",
    progress,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

async function holdBackGesture(): Promise<void> {
  await gesture(started());
  await gesture(moved(PREVIEW_PROGRESS));
}

async function expectPageAtRest(page: Page): Promise<void> {
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("transform", "none");
  await expect(main).toHaveCSS("border-top-left-radius", "0px");
  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
  await expect(page.locator("[data-leaving-screen]")).toHaveCount(0);
}

async function expectPagePreviewed(page: Page): Promise<void> {
  const main = page.getByRole("main");
  await expect(main).not.toHaveCSS("transform", "none");
  await expect(main).toHaveCSS(
    "border-top-left-radius",
    `${String(SCREEN_CORNER_PX)}px`,
  );
}

async function releaseIntoBack(page: Page): Promise<void> {
  await gesture({ kind: "released", progress: PREVIEW_PROGRESS, velocity: 0 });
  await page.goBack();
}

async function openLibrary(page: Page): Promise<Locator> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem")).toHaveCount(LIBRARY.length);
  return list;
}

async function openViewOptions(page: Page): Promise<Locator> {
  await openLibrary(page);
  await page.getByRole("button", { name: "View options" }).click();
  const sheet = page.getByRole("dialog", { name: "View options" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

async function openSortMenu(page: Page): Promise<Locator> {
  await openLibrary(page);
  await page.getByRole("button", { name: /^Sort and filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Sort and filter" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  await sheet.getByRole("combobox", { name: "Sort by" }).click();
  const menu = page.getByRole("listbox", { name: "Sort by" });
  await expect(menu).toBeVisible();
  return menu;
}

async function openChoiceDialog(page: Page): Promise<Locator> {
  await page.goto("/settings/advanced");
  await page.getByRole("button", { name: /^Keep Undo for/ }).click();
  const dialog = page.getByRole("dialog", { name: "Keep Undo for" });
  await expect(dialog).toBeVisible();
  await settle(dialog);
  return dialog;
}

async function openBookSearch(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page.getByRole("button", { name: "Find a book" }).click();
  const field = page.getByRole("searchbox", { name: "Find a book" });
  await expect(field).toBeFocused();
  return field;
}

async function selectASeries(page: Page): Promise<Locator> {
  const list = await openLibrary(page);
  await selectByLongPress(page, list.getByRole("listitem").nth(1));
  const actions = page.getByRole("group", { name: "Selected series" });
  await expect(actions).toBeVisible();
  return actions;
}

test.describe("a back gesture held while back belongs to something open", () => {
  test("leaves the Library at rest behind View options and closes the sheet on release", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);

    await holdBackGesture();

    await expectPageAtRest(page);
    await releaseIntoBack(page);
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await expectPageAtRest(page);
  });

  test("keeps the sheet open when the gesture is cancelled", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);

    await holdBackGesture();
    await gesture({ kind: "cancelled" });

    await expectPageAtRest(page);
    await expect(sheet).toBeVisible();
  });

  test("leaves the page at rest behind a menu", async ({ page }) => {
    const menu = await openSortMenu(page);

    await holdBackGesture();

    await expectPageAtRest(page);
    await releaseIntoBack(page);
    await expect(menu).toBeHidden();
  });

  test("leaves the page at rest behind a dialog", async ({ page }) => {
    const dialog = await openChoiceDialog(page);

    await holdBackGesture();

    await expectPageAtRest(page);
    await releaseIntoBack(page);
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/settings/advanced");
  });

  test("leaves the Library at rest behind a selection", async ({ page }) => {
    const actions = await selectASeries(page);

    await holdBackGesture();

    await expectPageAtRest(page);
    await releaseIntoBack(page);
    await expect(actions).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("leaves the page at rest behind an open search", async ({ page }) => {
    const field = await openBookSearch(page);

    await holdBackGesture();

    await expectPageAtRest(page);
    await releaseIntoBack(page);
    await expect(field).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(`/series/${SERIES_ID}`);
  });

  test("previews the page again on the next gesture once back closed the sheet", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    await holdBackGesture();
    await releaseIntoBack(page);
    await expect(sheet).toBeHidden();
    await expectPageAtRest(page);

    await holdBackGesture();

    await expectPagePreviewed(page);
  });

  test("previews the page on the next gesture once the sheet closed some other way", async ({
    page,
  }) => {
    const sheet = await openViewOptions(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await holdBackGesture();

    await expectPagePreviewed(page);
  });

  test("ends at rest when a sheet opens in the middle of a gesture", async ({
    page,
  }) => {
    await openLibrary(page);
    await holdBackGesture();
    await expectPagePreviewed(page);

    await page
      .getByRole("button", { name: "View options" })
      .dispatchEvent("click");
    const sheet = page.getByRole("dialog", { name: "View options" });
    await expect(sheet).toBeVisible();
    await releaseIntoBack(page);

    await expect(sheet).toBeHidden();
    await expectPageAtRest(page);
  });
});
