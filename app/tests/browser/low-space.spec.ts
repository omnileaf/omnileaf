import type { Locator, Page } from "@playwright/test";

import type { StorageUse } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const GIGABYTE = 1_000_000_000;
const MEGABYTE = 1_000_000;
const LIBRARY = sampleSeries(12);

let used: StorageUse;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    checkStorage: () => used,
    clearCachedPages: () => {
      used = {
        ...used,
        freeBytes: used.freeBytes + used.cachedPagesBytes,
        cachedPagesBytes: 0,
        isLow: false,
      };
      return null;
    },
  },
});

test.beforeEach(() => {
  used = {
    omnileafBytes: 1.44 * GIGABYTE,
    cachedPagesBytes: 1.2 * GIGABYTE,
    coversBytes: 210 * MEGABYTE,
    freeBytes: 1.1 * GIGABYTE,
    totalBytes: 128 * GIGABYTE,
    isLow: true,
  };
});

function notice(page: Page): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText("Almost out of space", { exact: true }) })
    .filter({ hasText: "Omnileaf clears" });
}

test("warns how much is left and that the oldest cached pages and covers go first", async ({
  page,
}) => {
  await page.goto("/");

  await expect(notice(page)).toContainText(
    /1\.1 GB left on this (phone|tablet|computer)\. Omnileaf clears the oldest cached pages and covers first\./,
  );
});

test("leads to Settings › Storage from Free up space", async ({ page }) => {
  await page.goto("/");

  await notice(page).getByRole("button", { name: "Free up space" }).click();

  await expect(
    page.getByRole("heading", { name: "Storage", level: 1 }),
  ).toBeVisible();
});

test("goes once clearing makes room again", async ({ page }) => {
  await page.goto("/settings/storage");
  await expect(notice(page)).toBeVisible();

  await page.getByRole("button", { name: "Clear Cached pages" }).click();

  await expect(notice(page)).toHaveCount(0);
});

test("stays quiet while there's room", async ({ page }) => {
  used = { ...used, freeBytes: 41 * GIGABYTE, isLow: false };
  await page.goto("/");

  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no accessibility violations with the warning shown in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    await expect(notice(page)).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}
