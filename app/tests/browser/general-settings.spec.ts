import type { Locator, Page } from "@playwright/test";

import { accessibilityViolations, expect, test } from "./fixtures.ts";

function opensOn(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Omnileaf opens on" });
}

function timeFormat(page: Page): Locator {
  return page.getByRole("combobox", { name: "Time format" });
}

test("opens on the library until another place is chosen, and keeps the place chosen", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(
    opensOn(page).getByRole("radio", { name: "Library", exact: true }),
  ).toBeChecked();

  await opensOn(page)
    .getByRole("radio", { name: "Last book", exact: true })
    .click();
  await page.reload();

  await expect(
    opensOn(page).getByRole("radio", { name: "Last book", exact: true }),
  ).toBeChecked();
  await expect(
    opensOn(page).getByRole("radio", { name: "Last book", exact: true }),
  ).toHaveAccessibleDescription(
    "The reader, where you left it; the library when there's none.",
  );
});

test("follows the system's clock until a time format is chosen, and keeps it", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(timeFormat(page)).toHaveValue("system");
  await expect(
    timeFormat(page).getByRole("option", { selected: true }),
  ).toHaveText(/^Follow the system \((12|24)-hour\)$/);

  await timeFormat(page).selectOption("twelveHour");
  await page.reload();

  await expect(timeFormat(page)).toHaveValue("twelveHour");
});

test("has no accessibility violations", async ({ page }) => {
  await page.goto("/settings/general");
  await expect(opensOn(page)).toBeVisible();

  expect(await accessibilityViolations(page)).toEqual([]);
});
