import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const BOLD_REGULAR_WEIGHT = "700";
const PLAIN_REGULAR_WEIGHT = "400";
const BOLD_ROW_TITLE_WEIGHT = "700";
const PLAIN_ROW_TITLE_WEIGHT = "400";

let isSystemBold = false;

test.use({
  backend: { ...DEFAULT_BACKEND, systemBoldText: () => isSystemBold },
});

async function openAccessibility(page: Page): Promise<void> {
  await page.goto("/settings/accessibility");
  await expect(
    page.getByRole("heading", { level: 1, name: "Accessibility" }),
  ).toBeVisible();
}

function boldText(page: Page): Locator {
  return page
    .getByRole("region", { name: "Text" })
    .getByRole("switch", { name: "Bold text" });
}

function bodyWeight(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).fontWeight);
}

function rowTitleWeight(page: Page): Promise<string> {
  return page
    .getByText("Open Android accessibility settings", { exact: true })
    .evaluate((title) => getComputedStyle(title).fontWeight);
}

test.describe("Bold text on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's settings");
    isSystemBold = false;
  });

  test("starts from the phone's Bold text being on", async ({ page }) => {
    isSystemBold = true;
    await openAccessibility(page);

    await expect(boldText(page)).toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(BOLD_REGULAR_WEIGHT);
  });

  test("bolds the interface once chosen, and keeps it after a reload", async ({
    page,
  }) => {
    await openAccessibility(page);
    await expect(boldText(page)).not.toBeChecked();

    await boldText(page).click();
    await expect.poll(() => bodyWeight(page)).toBe(BOLD_REGULAR_WEIGHT);
    await page.reload();

    await expect(boldText(page)).toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(BOLD_REGULAR_WEIGHT);
    await expect.poll(() => rowTitleWeight(page)).toBe(BOLD_ROW_TITLE_WEIGHT);
  });

  test("keeps plain text once chosen, even with the phone's Bold text on", async ({
    page,
  }) => {
    isSystemBold = true;
    await openAccessibility(page);

    await boldText(page).click();
    await page.reload();

    await expect(boldText(page)).not.toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(PLAIN_REGULAR_WEIGHT);
    await expect.poll(() => rowTitleWeight(page)).toBe(PLAIN_ROW_TITLE_WEIGHT);
  });
});
