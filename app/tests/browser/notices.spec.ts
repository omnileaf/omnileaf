import { AxeBuilder } from "@axe-core/playwright";

import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

const UNREADABLE =
  "Couldn't read that folder Omnileaf may not be allowed to open it, or it may have moved. Your library hasn't changed. Choose another folder";

const CORNER_INSET = 24;
const NOTICE_WIDTH = 440;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    addLibraryFolder: () => {
      throw new CommandFailure({
        code: "folderUnreadable",
        message: "the folder could not be read",
      });
    },
  },
});

function emptyLibraryAddFolder(page: Page) {
  return page
    .getByRole("region", { name: "Your library is empty" })
    .getByRole("button", { name: "Add a folder" });
}

async function failToAddAFolder(page: Page) {
  await page.goto("/");
  await emptyLibraryAddFolder(page).click();
  const warning = page.getByRole("alert");
  await expect(warning).toHaveText(UNREADABLE);
  const card = warning.locator(":scope > *");
  await card.evaluate((element) =>
    Promise.all(element.getAnimations().map(({ finished }) => finished)),
  );
  return card;
}

test("warns that the folder couldn't be read and offers another", async ({
  page,
}) => {
  await failToAddAFolder(page);

  await expect(
    page.getByRole("alert").getByRole("button", {
      name: "Choose another folder",
    }),
  ).toBeVisible();
});

test("shows the warning just above the navigation on phones", async ({
  page,
}) => {
  const card = await failToAddAFolder(page);
  const viewport = viewportOf(page);
  test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");

  const box = await boxOf(card);
  const navigation = await boxOf(
    page.getByRole("navigation", { name: "Main" }),
  );

  expect(box.y + box.height).toBeLessThan(navigation.y);
  expect(box.x).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThan(viewport.width);
});

test("shows the warning in the bottom corner on tablets and desktops", async ({
  page,
}) => {
  const card = await failToAddAFolder(page);
  const viewport = viewportOf(page);
  test.skip(viewport.width < MEDIUM_MIN_WIDTH, "tablets and desktops only");

  const box = await boxOf(card);

  expect(box.width).toBe(NOTICE_WIDTH);
  expect(viewport.width - (box.x + box.width)).toBe(CORNER_INSET);
  expect(viewport.height - (box.y + box.height)).toBe(CORNER_INSET);
});

test("reaches the warning from the keyboard after the page", async ({
  page,
}) => {
  await failToAddAFolder(page);
  await emptyLibraryAddFolder(page).focus();

  await page.keyboard.press("Tab");
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toBeEmpty();
  await expect(emptyLibraryAddFolder(page)).toBeFocused();
});

test("puts the warning away when the page changes", async ({ page }) => {
  await failToAddAFolder(page);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Browse" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Browse" }),
  ).toBeFocused();
  await expect(page.getByRole("alert")).toBeEmpty();
});

test("rises into place", async ({ page }) => {
  await page.goto("/");

  await emptyLibraryAddFolder(page).click();

  const card = page.getByRole("alert").locator(":scope > *");

  await expect(card).toHaveCSS("animation-name", "notice-rise");
});

test("appears at once with reduce motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await emptyLibraryAddFolder(page).click();

  const card = page.getByRole("alert").locator(":scope > *");
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("animation-name", "none");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a warning has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await failToAddAFolder(page);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
