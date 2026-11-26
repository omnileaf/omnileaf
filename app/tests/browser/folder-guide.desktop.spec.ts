import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, test, tokenColour } from "./fixtures.ts";

const WIDE_WINDOW = { width: 1280, height: 1300 };
const RULE_ICON = 16;
const MONOSPACE = /monospace/;
const INTRO =
  "Omnileaf reads your files where they are and never moves, renames or changes them.";

async function openGuide(page: Page): Promise<void> {
  await page.goto("/settings/library/folders");
  await expect(
    page.getByRole("heading", { name: "How folders are read" }).last(),
  ).toBeVisible();
}

function rules(page: Page, group: "Folders" | "Files"): Locator {
  return page.getByRole("list", { name: group, exact: true });
}

function sectionOf(page: Page, heading: string): Locator {
  return page.getByRole("region", { name: heading });
}

test("keeps Library current in Settings and leads back to it", async ({
  page,
}) => {
  await page.goto("/settings/library/folders");

  await expect(
    page
      .getByRole("navigation", { name: "Settings" })
      .getByRole("link", { name: "Library" }),
  ).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: "Back to Library" }).click();

  await expect(page).toHaveURL(/\/settings\/library$/);
});

test("says in one muted line that files are never changed", async ({
  page,
}) => {
  await openGuide(page);
  const intro = page.getByText(INTRO, { exact: true });

  await expect(intro).toBeVisible();
  await expect(intro).toHaveCSS("font-size", "14px");
  await expect(intro).toHaveCSS(
    "color",
    await tokenColour(page, "--color-muted"),
  );
  await expect(page.getByText(/laid out like this/)).toHaveCount(0);
});

test("puts the example and the naming rules each in a card under its own heading", async ({
  page,
}) => {
  await openGuide(page);
  const border = await tokenColour(page, "--color-border");

  for (const heading of ["An example folder", "What the names mean"]) {
    const card = sectionOf(page, heading);
    await expect(card).toHaveCSS("border-top-style", "solid");
    await expect(card).toHaveCSS("border-top-color", border);
    await expect(card).toHaveCSS(
      "background-color",
      await tokenColour(page, "--color-card"),
    );
  }
  await expect(
    sectionOf(page, "An example folder").getByRole("table"),
  ).toBeVisible();
  await expect(
    sectionOf(page, "What the names mean").getByRole("list"),
  ).toHaveCount(2);
});

test("puts Files beside Folders in a wide window", async ({ page }) => {
  await page.setViewportSize(WIDE_WINDOW);
  await openGuide(page);
  const folders = await boxOf(rules(page, "Folders"));
  const files = await boxOf(rules(page, "Files"));

  expect(files.y).toBeCloseTo(folders.y, 0);
  expect(files.x).toBeGreaterThan(folders.x + folders.width);
});

test("leads each rule with a 16px icon and sets its example names in monospace", async ({
  page,
}) => {
  await openGuide(page);
  const row = rules(page, "Files").getByRole("listitem").first();
  const icon = row.locator("[data-icon]");

  await expect(icon).toHaveAttribute("data-icon", "file-text");
  expect((await boxOf(icon)).width).toBe(RULE_ICON);
  await expect(row.getByText("Volume", { exact: true })).toHaveCSS(
    "font-weight",
    "500",
  );
  await expect(row.locator("code")).toHaveCSS("font-family", MONOSPACE);
  await expect(
    rules(page, "Folders").getByRole("listitem").first().locator("[data-icon]"),
  ).toHaveAttribute("data-icon", "folder");
});

test("draws a line between rules, not above the first", async ({ page }) => {
  await openGuide(page);
  const rows = rules(page, "Folders").getByRole("listitem");

  await expect(rows.first()).toHaveCSS("border-top-width", "0px");
  await expect(rows.nth(1)).toHaveCSS("border-top-width", "1px");
});
