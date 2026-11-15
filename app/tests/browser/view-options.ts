import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import { expect, settle } from "./fixtures.ts";
import { type Messages, pressViewOptions } from "./library-controls.ts";

export function viewOptionsButton(page: Page): Locator {
  return page.getByRole("main").getByRole("button", { name: "View options" });
}

export function viewOptions(page: Page, messages: Messages = english): Locator {
  return page.getByRole("dialog", { name: messages.library_view_options });
}

export async function openViewOptions(
  page: Page,
  messages: Messages = english,
): Promise<Locator> {
  await pressViewOptions(page, messages);
  await expect(viewOptions(page, messages)).toBeVisible();
  await settle(viewOptions(page, messages));
  return viewOptions(page, messages);
}

export async function choose(options: Locator, label: string): Promise<void> {
  await options
    .locator("label")
    .or(options.getByRole("radio"))
    .or(options.getByRole("switch"))
    .filter({ hasText: label })
    .click();
}
