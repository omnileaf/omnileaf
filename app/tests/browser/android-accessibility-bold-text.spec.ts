import type { Locator, Page } from "@playwright/test";

import type { FakeChannel } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const BOLD_REGULAR_WEIGHT = "700";
const PLAIN_REGULAR_WEIGHT = "400";
const BOLD_ROW_TITLE_WEIGHT = "700";
const PLAIN_ROW_TITLE_WEIGHT = "400";

let systemBoldTexts: FakeChannel<boolean> | undefined;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    watchSystemBoldText: (channel) => {
      systemBoldTexts = channel;
      return null;
    },
  },
});

async function reportSystemBoldText(isBold: boolean): Promise<void> {
  await expect.poll(() => systemBoldTexts).toBeDefined();
  await systemBoldTexts?.send(isBold);
}

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
    systemBoldTexts = undefined;
  });

  test("starts from the phone's Bold text being on", async ({ page }) => {
    await openAccessibility(page);
    await reportSystemBoldText(true);

    await expect(boldText(page)).toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(BOLD_REGULAR_WEIGHT);
  });

  test("follows the phone's Bold text as it changes while the app is open", async ({
    page,
  }) => {
    await openAccessibility(page);
    await reportSystemBoldText(true);
    await expect(boldText(page)).toBeChecked();

    await reportSystemBoldText(false);

    await expect(boldText(page)).not.toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(PLAIN_REGULAR_WEIGHT);
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
    await openAccessibility(page);
    await reportSystemBoldText(true);

    await boldText(page).click();
    systemBoldTexts = undefined;
    await page.reload();
    await reportSystemBoldText(true);

    await expect(boldText(page)).not.toBeChecked();
    await expect.poll(() => bodyWeight(page)).toBe(PLAIN_REGULAR_WEIGHT);
    await expect.poll(() => rowTitleWeight(page)).toBe(PLAIN_ROW_TITLE_WEIGHT);
  });
});
