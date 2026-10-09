import type { Page } from "@playwright/test";

import { expect, MEDIUM_MIN_WIDTH, test, viewportOf } from "./fixtures.ts";

const OUTSIDE_THE_APP = "about:blank";
const LIBRARY_URL = "/";
const SETTINGS_OPENING_SECTION_URL = "/settings/library";
const GENERAL_URL = "/settings/general";

function showsSettingsSectionsBeside(page: Page): boolean {
  return viewportOf(page).width >= MEDIUM_MIN_WIDTH;
}

async function openSection(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: label })
    .click();
  await expectPage(page, label);
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();
  if (showsSettingsSectionsBeside(page)) {
    await expect(page).toHaveURL(SETTINGS_OPENING_SECTION_URL);
    await expectPage(page, "Library");
  } else {
    await expectPage(page, "Settings");
  }
}

async function openSettingsPage(page: Page, label: string): Promise<void> {
  await page.getByRole("main").getByRole("link", { name: label }).click();
  await expectPage(page, label);
}

/** Taps each of the main navigation's links named in `labels` within one task, before the app can react to the first. */
async function tapMainLinksAtOnce(
  page: Page,
  labels: readonly string[],
): Promise<void> {
  await page.evaluate((names) => {
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        "nav[aria-label='Main'] a",
      ),
    ];
    for (const name of names) {
      links.find((link) => link.textContent.trim() === name)?.click();
    }
  }, labels);
}

async function expectPage(page: Page, title: string): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

async function expectLibrary(page: Page): Promise<void> {
  await expect(page).toHaveURL(LIBRARY_URL);
  await expectPage(page, "Library");
}

test.beforeEach(async ({ page }) => {
  await page.goto(LIBRARY_URL);
  await expectLibrary(page);
});

test("goes back to Library from a section, however many sections came between", async ({
  page,
}) => {
  await openSection(page, "Browse");
  await openSection(page, "History");

  await page.goBack();

  await expectLibrary(page);
});

test("goes back up one level at a time from a Settings page", async ({
  page,
}) => {
  test.skip(showsSettingsSectionsBeside(page), "one pane only");
  await openSettings(page);
  await openSettingsPage(page, "Appearance");

  await page.goBack();
  await expectPage(page, "Settings");
  await page.goBack();

  await expectLibrary(page);
});

test("goes back to Library from a Settings section shown beside the list", async ({
  page,
}) => {
  test.skip(!showsSettingsSectionsBeside(page), "two panes only");
  await openSettings(page);
  await openSettingsPage(page, "Appearance");

  await page.goBack();

  await expectLibrary(page);
});

test("goes back up to General from Language", async ({ page }) => {
  await openSettings(page);
  await openSettingsPage(page, "General");
  await openSettingsPage(page, "Language");

  await page.goBack();

  await expect(page).toHaveURL(GENERAL_URL);
  await expectPage(page, "General");
});

test("goes back to Library from a section opened after Settings took another section's place", async ({
  page,
}) => {
  await openSection(page, "Browse");
  await openSettings(page);
  await openSection(page, "History");

  await page.goBack();

  await expectLibrary(page);
});

test("goes back to Library from a section opened on a Settings page", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsPage(page, "About");
  await openSection(page, "History");

  await page.goBack();

  await expectLibrary(page);
});

test("goes back to Library after returning to Settings from one of its pages", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsPage(page, "General");
  await openSettings(page);

  await page.goBack();

  await expectLibrary(page);
});

test("leaves the app from Library after visiting other sections", async ({
  page,
}) => {
  await openSection(page, "Browse");
  await openSettings(page);
  await openSettingsPage(page, "Appearance");
  await openSection(page, "Library");

  await page.goBack();

  await expect(page).toHaveURL(OUTSIDE_THE_APP);
});

test("moves focus only to the page opened from a Settings page", async ({
  page,
}) => {
  await openSettings(page);
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
  await openSettings(page);
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

test("opens the second of two links tapped at once from a Settings page, and keeps back going up", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsPage(page, "About");

  await tapMainLinksAtOnce(page, ["Library", "History"]);

  await expectPage(page, "History");
  await page.goBack();
  await expectLibrary(page);
});

test("opens a link followed while it is still going back, and keeps back going up", async ({
  page,
}) => {
  await openSection(page, "Browse");

  await tapMainLinksAtOnce(page, ["Library", "History"]);

  await expectPage(page, "History");
  await page.goBack();
  await expectLibrary(page);
});

test("adds no second entry for a page tapped again while going back to it", async ({
  page,
}) => {
  await openSection(page, "Browse");

  await tapMainLinksAtOnce(page, ["Library", "Library"]);

  await expectLibrary(page);
  await page.goBack();
  await expect(page).toHaveURL(OUTSIDE_THE_APP);
});
