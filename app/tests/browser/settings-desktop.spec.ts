import type { Page } from "@playwright/test";

import { EXPANDED_MIN_WIDTH, expect, test, viewportOf } from "./fixtures.ts";

function sectionList(page: Page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

test("opens the first settings section beside the list on desktop", async ({
  page,
}) => {
  await page.goto("/");
  test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "desktop only");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();

  await expect(page).toHaveURL("/settings/library");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
  await expect(
    sectionList(page).getByRole("link", { name: "Library" }),
  ).toHaveAttribute("aria-current", "page");
});

test("switches settings sections from the list on desktop", async ({
  page,
}) => {
  await page.goto("/settings/library");
  test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "desktop only");

  await sectionList(page).getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL("/settings/about");
  await expect(
    sectionList(page).getByRole("link", { name: "About" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: "Back to Settings" }),
  ).toBeHidden();
});

test("keeps the settings list to the index on phones and tablets", async ({
  page,
}) => {
  await page.goto("/settings/about");
  test.skip(viewportOf(page).width >= EXPANDED_MIN_WIDTH, "below desktop only");

  await expect(sectionList(page)).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Back to Settings" }),
  ).toBeVisible();
});
