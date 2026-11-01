import type { Page } from "@playwright/test";

import {
  boxOf,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const WINDOW = { width: 1280, height: 800 };
const SIDEBAR_WIDTH = 240;
const ROW_HEIGHT = 32;
const ROW_RADIUS = "8px";
const ROW_TYPE = { fontSize: "13px", fontWeight: "510" };
const TITLE_TYPE = {
  fontSize: "13px",
  fontWeight: "700",
  letterSpacing: "-0.08px",
};
const SIDE_PADDING = 24;
const BAR_TO_CONTENT = 20;
const START_OF_ROW_TEXT = "6px";
const END_OF_ROW_TEXT = "10px";

function pages(page: Page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

function pageLink(page: Page, name: string) {
  return pages(page).getByRole("link", { name });
}

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.describe("the pages sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/appearance");
    await expect(pages(page)).toBeVisible();
  });

  test("is 240px wide with no caption above its rows", async ({ page }) => {
    const sidebar = pages(page).locator("..");

    expect((await boxOf(sidebar)).width).toBe(SIDEBAR_WIDTH);
    await expect(sidebar.getByText("Settings", { exact: true })).toHaveCount(0);
  });

  test("draws a row 32px high with 13px medium text and 8px corners", async ({
    page,
  }) => {
    const row = pageLink(page, "Storage");

    expect((await boxOf(row)).height).toBe(ROW_HEIGHT);
    await expect(row).toHaveCSS("font-size", ROW_TYPE.fontSize);
    await expect(row).toHaveCSS("font-weight", ROW_TYPE.fontWeight);
    await expect(row).toHaveCSS("border-radius", ROW_RADIUS);
  });

  test("insets the icon 6px and the text 10px from the row's ends", async ({
    page,
  }) => {
    const row = pageLink(page, "Storage");

    await expect(row).toHaveCSS("padding-inline-start", START_OF_ROW_TEXT);
    await expect(row).toHaveCSS("padding-inline-end", END_OF_ROW_TEXT);
    await expect(row).toHaveCSS("column-gap", "8px");
  });

  test("tints the open row with the sidebar indicator and keeps its weight", async ({
    page,
  }) => {
    const open = pageLink(page, "Appearance");

    await expect(open).toHaveAttribute("aria-current", "page");
    await expect(open).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-nav-indicator"),
    );
    await expect(open).toHaveCSS("font-weight", ROW_TYPE.fontWeight);
    await expect(pageLink(page, "Storage")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  test("draws the icons in the accent colour", async ({ page }) => {
    await expect(pageLink(page, "Storage").locator("svg")).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-link"),
    );
  });
});

test.describe("the title bar", () => {
  test("holds the page's title in 13px bold type with no breadcrumb", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const title = page.getByRole("heading", { level: 1, name: "General" });

    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("font-size", TITLE_TYPE.fontSize);
    await expect(title).toHaveCSS("font-weight", TITLE_TYPE.fontWeight);
    await expect(title).toHaveCSS("letter-spacing", TITLE_TYPE.letterSpacing);
    expect((await boxOf(title)).y).toBeLessThan(56);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveCount(0);
  });

  test("leads a nested page with a Back chevron before its title", async ({
    page,
  }) => {
    await page.goto("/settings/library/adult-content");
    const back = page.getByRole("link", { name: "Back to Library" });
    const title = page.getByRole("heading", { level: 1, name: "18+ content" });

    await expect(back).toBeVisible();
    expect((await boxOf(back)).x).toBeLessThan((await boxOf(title)).x);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveCount(0);
  });

  test("goes back to the page it came from", async ({ page }) => {
    await page.goto("/settings/library/adult-content");

    await page.getByRole("link", { name: "Back to Library" }).click();

    await expect(page).toHaveURL("/settings/library");
  });

  test("leaves a page with no Back link on its first level", async ({
    page,
  }) => {
    await page.goto("/settings/general");

    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
  });
});

test.describe("the page beside the sidebar", () => {
  test("sits 24px in from the sidebar", async ({ page }) => {
    await page.goto("/settings/general");
    const sidebar = await boxOf(pages(page).locator(".."));
    const group = await boxOf(
      page.getByRole("region", { name: "Omnileaf opens on" }),
    );

    expect(group.x - (sidebar.x + sidebar.width)).toBe(SIDE_PADDING);
  });

  test("starts 20px under the title bar", async ({ page }) => {
    await page.goto("/settings/general");
    const bar = await boxOf(
      page.getByRole("heading", { level: 1, name: "General" }).locator(".."),
    );
    const group = await boxOf(
      page.getByRole("region", { name: "Omnileaf opens on" }),
    );

    expect(group.y - (bar.y + bar.height)).toBe(BAR_TO_CONTENT);
  });
});

test.describe("on Linux", () => {
  test.use({ platform: "linux" });

  test("keeps the Settings caption, the breadcrumb and 500 weight rows", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");

    await expect(
      pages(page).locator("..").getByText("Settings", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    await expect(pageLink(page, "Appearance")).toHaveCSS("font-weight", "500");
  });
});
