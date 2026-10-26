import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import { expect } from "./fixtures.ts";

type Messages = typeof english;

export async function foldsIntoMore(page: Page): Promise<boolean> {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  const platform = await page.evaluate(
    () => document.documentElement.dataset.platform,
  );
  return (
    platform === "ios" && (await main.locator("[data-title-bar]").count()) > 0
  );
}

export async function openLibraryMore(
  page: Page,
  messages: Messages = english,
): Promise<void> {
  await page
    .getByRole("main")
    .locator("[data-title-bar]")
    .getByRole("button", { name: messages.library_more })
    .click();
}

async function pressLibraryControl(
  page: Page,
  name: string,
  messages: Messages,
): Promise<void> {
  if (await foldsIntoMore(page)) {
    await openLibraryMore(page, messages);
    await page.getByRole("menuitem", { name }).click();
    return;
  }
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

export async function openSortAndFilter(page: Page): Promise<void> {
  await pressLibraryControl(page, "Sort and filter", english);
  await expect(
    page
      .getByRole("dialog", { name: "Sort and filter" })
      .or(page.getByRole("complementary", { name: "Sort and filter" })),
  ).toBeVisible();
}

export async function pressViewOptions(
  page: Page,
  messages: Messages = english,
): Promise<void> {
  await pressLibraryControl(page, messages.library_view_options, messages);
}
