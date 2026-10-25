import type { Page } from "@playwright/test";

import { expect, MEDIUM_MIN_WIDTH, viewportOf } from "./fixtures.ts";

/** An iPhone keeps Sort and filter and View options in the library's More menu rather than in its bar. */
export async function foldsIntoMore(page: Page): Promise<boolean> {
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  const platform = await page.evaluate(
    () => document.documentElement.dataset.platform,
  );
  return platform === "ios" && viewportOf(page).width < MEDIUM_MIN_WIDTH;
}

async function pressLibraryControl(page: Page, name: string): Promise<void> {
  const main = page.getByRole("main");
  if (await foldsIntoMore(page)) {
    await main
      .locator("[data-title-bar]")
      .getByRole("button", { name: /^More/ })
      .click();
    await page.getByRole("menuitem", { name }).click();
    return;
  }
  await main.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

export async function openSortAndFilter(page: Page): Promise<void> {
  await pressLibraryControl(page, "Sort and filter");
  await expect(
    page
      .getByRole("dialog", { name: "Sort and filter" })
      .or(page.getByRole("complementary", { name: "Sort and filter" })),
  ).toBeVisible();
}

export async function pressViewOptions(page: Page): Promise<void> {
  await pressLibraryControl(page, "View options");
}
