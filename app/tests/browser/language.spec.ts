import { accessibilityViolations, expect, test } from "./fixtures.ts";

async function openGeneral(page: import("@playwright/test").Page) {
  await page.goto("/settings");
  await page.getByRole("main").getByRole("link", { name: "General" }).click();
}

test("follows the system language by default", async ({ page }) => {
  await openGeneral(page);

  await expect(
    page.getByRole("radio", { name: "System (English)" }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("keeps a chosen language after reloading", async ({ page }) => {
  await openGeneral(page);

  await page.getByRole("radio", { name: "English", exact: true }).check();

  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();
});

test("goes back to the system language", async ({ page }) => {
  await openGeneral(page);
  await page.getByRole("radio", { name: "English", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();

  await page.getByRole("radio", { name: "System (English)" }).check();

  await expect(
    page.getByRole("radio", { name: "System (English)" }),
  ).toBeChecked();
});

test("Settings › General has no accessibility violations", async ({ page }) => {
  await openGeneral(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "General" }),
  ).toBeVisible();

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});
