import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const SHORTCUT = "Control+Shift+H";

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("Ctrl Shift H turns Screenshot mode on and off from any screen", async ({
  page,
}) => {
  await open(page, "/history");

  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();
  await open(page, "/browse");
  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("Screenshot mode is off")).toBeAttached();
});

test("says so when the hour runs out and again when the shortcut turns it back on", async ({
  page,
}) => {
  await page.clock.install();
  await open(page, "/");
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();

  await page.clock.runFor("01:00:00");
  await expect(page.getByText("Screenshot mode is off")).toBeAttached();
  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("Screenshot mode is on")).toBeAttached();
});
