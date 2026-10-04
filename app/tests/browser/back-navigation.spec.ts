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

test("moves focus only to the page opened from a Settings page", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "About");
  await page.evaluate(() => {
    const focusedHeadings: string[] = [];
    Object.assign(window, { focusedHeadings });
    document.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLHeadingElement) {
        focusedHeadings.push(event.target.textContent.trim());
      }
    });
  });

  await openSection(page, "History");

  expect(
    await page.evaluate((): unknown => Reflect.get(window, "focusedHeadings")),
  ).toEqual(["History"]);
});

test("keeps the query of a link opened from a Settings page", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "About");
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/history?from=about";
    link.textContent = "History with a query";
    document.querySelector("main")?.append(link);
  });

  await page.getByRole("link", { name: "History with a query" }).click();

  await expect(page).toHaveURL(/\/history\?from=about$/);
});

test("keeps the way back intact when two links are tapped at once", async ({
  page,
}) => {
  await openSection(page, "Settings");
  await openSettingsPage(page, "About");

  await page.evaluate(() => {
    const navigation = document.querySelector("nav");
    for (const label of ["Library", "History"]) {
      [...(navigation?.querySelectorAll("a") ?? [])]
        .find((link) => link.textContent.trim() === label)
        ?.click();
    }
  });
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/^(Library|History)$/);
  const landedOnHistory = (await heading.textContent()) === "History";
  await page.goBack();

  await expect(page).toHaveURL(
    landedOnHistory ? /^http:\/\/localhost:\d+\/$/ : OUTSIDE_THE_APP,
  );
});
