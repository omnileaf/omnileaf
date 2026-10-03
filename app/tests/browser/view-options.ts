import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

export function viewOptionsButton(page: Page): Locator {
  return page
    .locator("main header")
    .getByRole("button", { name: "View options" });
}

export function viewOptions(page: Page): Locator {
  return page.getByRole("dialog", { name: "View" });
}

export async function openViewOptions(page: Page): Promise<Locator> {
  await viewOptionsButton(page).click();
  await expect(viewOptions(page)).toBeVisible();
  return viewOptions(page);
}

export async function choose(options: Locator, label: string): Promise<void> {
  await options.locator("label").filter({ hasText: label }).click();
}
