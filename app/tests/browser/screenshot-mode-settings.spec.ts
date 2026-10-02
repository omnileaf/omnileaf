import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, onPlatform, test } from "./fixtures.ts";

const TURNED_ON_AT = new Date("2026-10-03T21:14:00Z");

const OPTIONS = [
  "Blank the pages in the reader",
  "Show the Screenshot mode label",
  "Turn off after 1 hour",
];

async function openScreenshotMode(page: Page): Promise<void> {
  await page.goto("/settings");
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "Privacy and security" }).click();
  await main.getByRole("link", { name: /^Screenshot mode/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Screenshot mode" }),
  ).toBeVisible();
}

function mainSwitch(page: Page) {
  return page.getByRole("switch", { name: "Screenshot mode", exact: true });
}

test("turning it on says when it turns off again", async ({ page }) => {
  await page.clock.install({ time: TURNED_ON_AT });
  await openScreenshotMode(page);
  await expect(mainSwitch(page)).not.toBeChecked();

  await mainSwitch(page).click();

  await expect(mainSwitch(page)).toBeChecked();
  await expect(mainSwitch(page)).toHaveAccessibleDescription(
    "On · turns off at 10:14 PM",
  );
});

test("it stays on after a restart and Privacy and security says so", async ({
  page,
}) => {
  await openScreenshotMode(page);
  await mainSwitch(page).click();

  await page.reload();
  await expect(mainSwitch(page)).toBeChecked();
  await page.getByRole("link", { name: "Privacy and security" }).click();

  await expect(
    page.getByRole("main").getByRole("link", { name: "Screenshot mode On" }),
  ).toBeVisible();
});

test("the options start on and stay off once turned off", async ({ page }) => {
  await openScreenshotMode(page);
  for (const option of OPTIONS) {
    await expect(page.getByRole("switch", { name: option })).toBeChecked();
    await page.getByRole("switch", { name: option }).click();
  }

  await page.reload();

  for (const option of OPTIONS) {
    await expect(page.getByRole("switch", { name: option })).not.toBeChecked();
  }
});

test("Space turns it on from the keyboard", async ({ page }) => {
  await openScreenshotMode(page);
  await mainSwitch(page).focus();

  await page.keyboard.press("Space");

  await expect(mainSwitch(page)).toBeChecked();
});

test("the keyboard shortcut is listed on a computer", async ({ page }) => {
  await openScreenshotMode(page);

  await expect(page.getByText("Keyboard shortcut")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use(onPlatform("android"));

  test("no keyboard shortcut is listed", async ({ page }) => {
    await openScreenshotMode(page);

    await expect(page.getByText("Keyboard shortcut")).toHaveCount(0);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const isOn of [false, true]) {
    test(`has no accessibility violations in ${colorScheme} while ${isOn ? "on" : "off"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openScreenshotMode(page);
      if (isOn) {
        await mainSwitch(page).click();
      }

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
}
