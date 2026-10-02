import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const OUTSIDE_THE_APP = "about:blank";

async function openSection(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: label })
    .click();
  await expectPage(page, label);
}

async function openSettingsPage(page: Page, label: string): Promise<void> {
  await page.getByRole("main").getByRole("link", { name: label }).click();
  await expectPage(page, label);
}

async function expectPage(page: Page, title: string): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expectPage(page, "Library");
});

test("goes back to Library from a section, however many sections came between", async ({
  page,
}) => {
  await openSection(page, "Browse");
  await openSection(page, "History");

  await page.goBack();

  await expectPage(page, "Library");
});

test("goes back up one level at a time from a Settings page", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "Appearance");

  await page.goBack();
  await expectPage(page, "Settings");
  await page.goBack();

  await expectPage(page, "Library");
});

test("goes back to Library from a section opened on a Settings page", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "About");
  await openSection(page, "History");

  await page.goBack();

  await expectPage(page, "Library");
});

test("goes back to Library after returning to Settings from one of its pages", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "General");
  await openSection(page, "Settings");

  await page.goBack();

  await expectPage(page, "Library");
});

test("leaves the app from Library after visiting other sections", async ({
  page,
}) => {
  await openSection(page, "Browse");
  await openSection(page, "Settings");
  await openSettingsPage(page, "Appearance");
  await openSection(page, "Library");

  await page.goBack();

  await expect(page).toHaveURL(OUTSIDE_THE_APP);
});
