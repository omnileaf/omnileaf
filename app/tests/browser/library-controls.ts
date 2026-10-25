import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

export async function foldsIntoMore(page: Page): Promise<boolean> {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  const bar = main.locator("[data-title-bar]");
  return (
    (await bar.count()) > 0 &&
    (await bar.getByRole("button", { name: /^Sort and filter/ }).count()) === 0
  );
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
