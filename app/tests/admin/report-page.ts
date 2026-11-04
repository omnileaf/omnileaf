import type { Locator, Page } from "@playwright/test";

import { heading } from "./checks.ts";
import { expect } from "./fixtures.ts";
import { openSignedIn } from "./sign-in.ts";

const MOVE_STATUS = "#move-status";

export function moveButton(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

export function badgeOf(page: Page): Locator {
  return heading(page).locator("xpath=..");
}

function moveStatus(page: Page): Locator {
  return page.locator(MOVE_STATUS);
}

export function reportRow(page: Page, code: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ hasText: code })
    .or(page.getByRole("row").filter({ hasText: code }));
}

export async function openReport(page: Page, code: string): Promise<void> {
  await openSignedIn(page, `/admin/reports/${code}`);
  await expect(heading(page)).toHaveText(code);
}

export async function expectMoveAnnounced(
  page: Page,
  text: string,
): Promise<void> {
  await expect(moveStatus(page)).toHaveText(text);
  await expect(moveStatus(page)).toBeFocused();
}
