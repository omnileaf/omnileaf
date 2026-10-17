import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

const HELD_MS = 600;
const LIBRARY = sampleSeries(6).map((series, index) => ({
  ...series,
  bookCount: 3,
  unreadCount: index % 3,
  language: "ja",
  hasDownloads: true,
}));

let catalog: WireSeries[] = [...LIBRARY];
let markedBack: string[] = [];

function booksOf(series: string): string[] {
  return [`${series}-a`, `${series}-b`];
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: catalog, next: null }),
    librarySeriesCount: () => catalog.length,
    markSeriesRead: (series) => {
      catalog = catalog.map((one) =>
        series.includes(one.id) ? { ...one, unreadCount: 0 } : one,
      );
      return series.flatMap(booksOf);
    },
    markBooks: (books) => {
      markedBack = [...books];
      catalog = [...LIBRARY];
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  catalog = [...LIBRARY];
  markedBack = [];
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function cover(page: Page, index: number): Locator {
  return seriesList(page).getByRole("listitem").nth(index);
}

function choice(page: Page, title: string): Locator {
  return seriesList(page).getByRole("checkbox", { name: title });
}

function titleOf(index: number): string {
  return LIBRARY[index]?.title ?? "";
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
}

async function startSelecting(page: Page, index: number): Promise<void> {
  const link = cover(page, index).getByRole("link").first();
  if (test.info().project.use.hasTouch === true) {
    const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
    await link.dispatchEvent("pointerdown", touch);
    await page.waitForTimeout(HELD_MS);
    const picked = choice(page, titleOf(index));
    await picked.dispatchEvent("pointerup", touch);
    await picked.dispatchEvent("click");
  } else {
    await link.click({ modifiers: ["ControlOrMeta"] });
  }
}

test("starts selecting a series with a long press, or Ctrl-click with a pointer", async ({
  page,
}) => {
  await openLibrary(page);

  await startSelecting(page, 1);

  await expect(page.getByText("1 selected").first()).toBeVisible();
  await expect(choice(page, titleOf(1))).toBeChecked();
  await expect(choice(page, titleOf(0))).not.toBeChecked();
  await expect(page).toHaveURL(/\/$/);
});

test("adds and takes off series with a tap while selecting", async ({
  page,
}) => {
  await openLibrary(page);
  await startSelecting(page, 0);

  await choice(page, titleOf(2)).click();
  await choice(page, titleOf(0)).click();

  await expect(page.getByText("1 selected").first()).toBeVisible();
  await expect(choice(page, titleOf(2))).toBeChecked();
});

test("selects every series listed with Select all", async ({ page }) => {
  await openLibrary(page);
  await startSelecting(page, 0);

  await page.getByRole("button", { name: /^Select all/ }).click();

  await expect(
    page.getByText(`${String(LIBRARY.length)} selected`).first(),
  ).toBeVisible();
});

test("hides the language, downloaded mark and Continue while selecting, keeping the unread count", async ({
  page,
}) => {
  await openLibrary(page);
  await startSelecting(page, 0);

  await expect(
    seriesList(page).getByRole("img", { name: "Downloaded chapters" }),
  ).toHaveCount(0);
  await expect(seriesList(page).getByText("JA", { exact: true })).toHaveCount(
    0,
  );
  await expect(cover(page, 1).getByText("1", { exact: true })).toBeVisible();
});

test("marks the series selected read, ends selecting, and offers Undo", async ({
  page,
}) => {
  await openLibrary(page);
  await startSelecting(page, 1);
  await choice(page, titleOf(2)).click();

  await page.getByRole("button", { name: "Mark as read" }).click();

  await expect(page.getByText("2 series marked as read")).toBeVisible();
  await expect(seriesList(page).getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => markedBack)
    .toEqual([
      ...booksOf(LIBRARY[1]?.id ?? ""),
      ...booksOf(LIBRARY[2]?.id ?? ""),
    ]);
});

test("ends selecting with its cross, and leaves every series as it was", async ({
  page,
}) => {
  await openLibrary(page);
  await startSelecting(page, 0);

  await page.getByRole("button", { name: "Cancel selecting" }).first().click();

  await expect(seriesList(page).getByRole("checkbox")).toHaveCount(0);
  await expect(seriesList(page).getByRole("link")).not.toHaveCount(0);
});

test.describe("with a pointer and keyboard", () => {
  test.skip(({ hasTouch }) => hasTouch, "a mouse and keys");

  test("adds every series between with Shift-click", async ({ page }) => {
    await openLibrary(page);
    await startSelecting(page, 1);

    await choice(page, titleOf(4)).click({ modifiers: ["Shift"] });

    await expect(page.getByText("4 selected").first()).toBeVisible();
  });

  test("selects every series with Ctrl A, and ends selecting with Escape", async ({
    page,
  }) => {
    await openLibrary(page);
    await startSelecting(page, 0);

    await page.keyboard.press("ControlOrMeta+A");
    await expect(
      page.getByText(`${String(LIBRARY.length)} selected`).first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(seriesList(page).getByRole("checkbox")).toHaveCount(0);
  });
});

test("selecting has no accessibility violations", async ({ page }) => {
  await openLibrary(page);
  await startSelecting(page, 0);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});
