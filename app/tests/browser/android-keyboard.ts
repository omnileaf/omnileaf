import type { Page } from "@playwright/test";

import { viewportOf } from "./fixtures.ts";

const KEYBOARD_HEIGHT = 336;

export async function showKeyboard(page: Page): Promise<void> {
  const { width, height } = viewportOf(page);
  await page.setViewportSize({ width, height: height - KEYBOARD_HEIGHT });
  await page.evaluate(() => {
    document.documentElement.toggleAttribute("data-keyboard-shown", true);
  });
}

export async function hideKeyboard(page: Page): Promise<void> {
  const { width, height } = viewportOf(page);
  await page.evaluate(() => {
    document.documentElement.toggleAttribute("data-keyboard-shown", false);
  });
  await page.setViewportSize({ width, height: height + KEYBOARD_HEIGHT });
}
