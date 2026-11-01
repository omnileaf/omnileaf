import type { Page } from "@playwright/test";

import {
  boxOf,
  expect,
  literalColour,
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
const TITLE_BAR_HEIGHT = 52;
const TITLE_BAR_START = 18;
const NARROWEST_WITH_SIDEBAR = 900;
const BELOW_SIDEBAR = 800;
const BAR_TO_CONTENT = 20;
const START_OF_ROW_TEXT = "6px";
const END_OF_ROW_TEXT = "10px";
const WHITE = "rgb(255, 255, 255)";
const ACCENT_LIGHT = "rgb(47, 111, 79)";
const ACCENT_DARK = "rgb(46, 125, 85)";

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

  test("tints the open row with the dark indicator in the dark theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    await expect(pageLink(page, "Appearance")).toHaveCSS(
      "background-color",
      await literalColour(page, "rgba(255, 255, 255, 0.056)"),
    );
  });

  test("tints the open row more with Increase contrast", async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-contrast", "more");
    });

    await expect(pageLink(page, "Appearance")).toHaveCSS(
      "background-color",
      await literalColour(page, "rgba(0, 0, 0, 0.13)"),
    );
  });

  test("draws no hover on a row", async ({ page }) => {
    const row = pageLink(page, "Storage");

    await row.hover();

    await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("selects a pressed row in the accent with its icon in the on-accent colour", async ({
    page,
  }) => {
    const row = pageLink(page, "Storage");
    const { x, y, width, height } = await boxOf(row);

    await page.mouse.move(x + width / 2, y + height / 2);
    await page.mouse.down();

    await expect(row).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    await expect(row.locator("svg")).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-primary"),
    );
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });

  test("rings a row inside its edge when the keyboard focuses it", async ({
    page,
  }) => {
    const row = pageLink(page, "Storage");

    await row.focus();

    await expect(row).toHaveCSS("outline-style", "solid");
    await expect(row).toHaveCSS("outline-offset", "-1px");
  });

  test("draws no line down the sidebar's edge", async ({ page }) => {
    await expect(pages(page).locator("..")).toHaveCSS(
      "border-inline-end-width",
      "0px",
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
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveCount(0);
  });

  test("is 52px high and starts its title 18px in", async ({ page }) => {
    await page.goto("/settings/general");
    const title = page.getByRole("heading", { level: 1, name: "General" });
    const bar = await boxOf(title.locator(".."));

    expect(bar.height).toBe(TITLE_BAR_HEIGHT);
    expect((await boxOf(title)).x - bar.x).toBe(TITLE_BAR_START);
  });

  test("sits its rows level with the bar's lower edge", async ({ page }) => {
    await page.goto("/settings/general");
    const bar = await boxOf(
      page.getByRole("heading", { level: 1, name: "General" }).locator(".."),
    );
    const firstRow = await boxOf(pageLink(page, "General"));

    expect(firstRow.y).toBe(bar.height + 10);
  });

  test("closes with a hairline in place of a border", async ({ page }) => {
    await page.goto("/settings/general");
    const bar = page
      .getByRole("heading", { level: 1, name: "General" })
      .locator("..");

    await expect(bar).toHaveCSS("border-bottom-width", "0px");
    await expect(bar).toHaveCSS(
      "box-shadow",
      /rgba\(0, 0, 0, 0\.05\) 0px -0\.67px 0px 0px inset$/,
    );
  });

  test("fills the bar with the Mac bar colour", async ({ page }) => {
    await page.goto("/settings/general");
    const bar = page
      .getByRole("heading", { level: 1, name: "General" })
      .locator("..");

    await expect(bar).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-top-bar-scrolled"),
    );
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

test.describe("below the width that shows the sidebar", () => {
  test.use({ viewport: { width: BELOW_SIDEBAR, height: WINDOW.height } });

  test("keeps the page's heading and drops the title bar", async ({ page }) => {
    await page.goto("/settings/general");

    await expect(
      page.getByRole("heading", { level: 1, name: "General" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeHidden();
  });
});

test.describe("at the narrowest width that shows the sidebar", () => {
  test.use({
    viewport: { width: NARROWEST_WITH_SIDEBAR, height: WINDOW.height },
  });

  test("still sits the page 24px in from the sidebar", async ({ page }) => {
    await page.goto("/settings/general");
    const sidebar = await boxOf(pages(page).locator(".."));
    const group = await boxOf(
      page.getByRole("region", { name: "Omnileaf opens on" }),
    );

    expect(group.x - (sidebar.x + sidebar.width)).toBe(SIDE_PADDING);
  });
});

for (const [scheme, accent] of [
  ["light", ACCENT_LIGHT],
  ["dark", ACCENT_DARK],
] as const) {
  test.describe(`a settings choice in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("fills the chosen segment in the accent green with white ink", async ({
      page,
    }) => {
      await page.goto("/settings/appearance");

      const chosen = page.getByRole("radiogroup").first().getByRole("radio", {
        checked: true,
      });

      await expect(chosen).toHaveCSS("background-color", accent);
      await expect(chosen).toHaveCSS("color", WHITE);
    });
  });
}

test.describe("on Windows", () => {
  test.use({ platform: "windows" });

  test("keeps the breadcrumb, the caption and the row indicator", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");
    const open = pageLink(page, "Appearance");

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    await expect(
      pages(page).locator("..").getByText("Settings", { exact: true }),
    ).toBeVisible();
    expect(
      await open.evaluate((row) => getComputedStyle(row, "::before").position),
    ).toBe("absolute");
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
