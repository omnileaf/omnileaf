import type { Locator, Page } from "@playwright/test";

import type { StorageUse } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";

const GIGABYTE = 1_000_000_000;
const MEGABYTE = 1_000_000;

let used: StorageUse;
let asked: string[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    checkStorage: () => used,
    clearCachedPages: () => {
      asked.push("clear pages");
      used = {
        ...used,
        omnileafBytes: used.omnileafBytes - used.cachedPagesBytes,
        cachedPagesBytes: 0,
      };
      return null;
    },
    clearCovers: () => {
      asked.push("clear covers");
      used = { ...used, coversBytes: 0 };
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
  asked = [];
});

function row(page: Page, title: string): Locator {
  return page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ has: page.getByRole("button") })
    .last();
}

test("opens from the Data and privacy group of the Settings list", async ({
  page,
}) => {
  await page.goto("/settings");

  await page
    .getByRole("main")
    .getByRole("link", { name: /^Storage/ })
    .click();

  await expect(
    page.getByRole("heading", { name: "Storage", level: 1 }),
  ).toBeVisible();
});

test("measures the space Omnileaf and everything else use, and what's free", async ({
  page,
}) => {
  await page.goto("/settings/storage");

  await expect(page.getByRole("meter", { name: "Space used" })).toHaveAttribute(
    "aria-valuetext",
    "1.1 GB free of 128 GB",
  );
  await expect(page.getByText("Omnileaf 1.4 GB")).toBeVisible();
  await expect(page.getByText("1.1 GB free")).toBeVisible();
});

test("lists the cached pages and the covers with their sizes", async ({
  page,
}) => {
  await page.goto("/settings/storage");

  await expect(row(page, "Cached pages")).toContainText(
    "1.2 GB · rebuilt when you read again",
  );
  await expect(row(page, "Covers")).toContainText("210 MB");
  await expect(
    page.getByText(
      "When space runs low, the oldest cached pages and covers go first. Your books and progress are never touched.",
    ),
  ).toBeVisible();
});

test("clears the cached pages at once and shows what's left", async ({
  page,
}) => {
  await page.goto("/settings/storage");

  await page.getByRole("button", { name: "Clear Cached pages" }).click();

  await expect(row(page, "Cached pages")).toContainText("0 MB");
  await expect(page.getByText("Omnileaf 240 MB")).toBeVisible();
  expect(asked).toEqual(["clear pages"]);
});

test("clears the covers at once", async ({ page }) => {
  await page.goto("/settings/storage");

  await page.getByRole("button", { name: "Clear Covers" }).click();

  await expect(row(page, "Covers")).toContainText("0 MB");
  expect(asked).toEqual(["clear covers"]);
});

test("sums Storage up by the space Omnileaf uses in the Settings list", async ({
  page,
}) => {
  await page.goto("/settings");
  test.skip(
    viewportOf(page).width >= EXPANDED_MIN_WIDTH,
    "settings opens its first section beside the list",
  );

  await expect(
    page.getByRole("main").getByRole("link", { name: /^Storage/ }),
  ).toContainText("1.4 GB used");
});

for (const theme of ["light", "dark"] as const) {
  test(`has no accessibility violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/settings/storage");
    await expect(page.getByRole("meter")).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}
