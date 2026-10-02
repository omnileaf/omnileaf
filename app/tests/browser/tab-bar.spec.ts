import { AxeBuilder } from "@axe-core/playwright";

import { expect, onPlatform, test } from "./fixtures.ts";

const BOTTOM_BAR_MAX_WIDTH = 600;

async function navigationBox(page: import("@playwright/test").Page) {
  const box = await page
    .getByRole("navigation", { name: "Main" })
    .boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("the navigation has no layout box");
  }
  return box;
}

function viewportOf(page: import("@playwright/test").Page) {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("the page has no viewport");
  }
  return viewport;
}

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("floats the bottom bar inset from the screen's edges on phones", async ({
    page,
  }) => {
    await page.goto("/");
    const viewport = viewportOf(page);
    test.skip(viewport.width >= BOTTOM_BAR_MAX_WIDTH, "phones only");

    const bar = await navigationBox(page);

    expect(bar.x).toBeGreaterThan(0);
    expect(bar.x + bar.width).toBeLessThan(viewport.width);
    expect(bar.y + bar.height).toBeLessThan(viewport.height);
    await expect(page.getByRole("navigation", { name: "Main" })).not.toHaveCSS(
      "border-radius",
      "0px",
    );
  });

  test("leaves room under the page so the floating bar never covers content", async ({
    page,
  }) => {
    await page.goto("/");
    const viewport = viewportOf(page);
    test.skip(viewport.width >= BOTTOM_BAR_MAX_WIDTH, "phones only");

    const bar = await navigationBox(page);
    const clearance = await page
      .getByRole("main")
      .evaluate((main) => parseFloat(getComputedStyle(main).paddingBlockEnd));

    expect(clearance).toBeGreaterThanOrEqual(viewport.height - bar.y);
  });

  test("keeps the rail and sidebar on tablets and desktops", async ({
    page,
  }) => {
    await page.goto("/");
    const viewport = viewportOf(page);
    test.skip(
      viewport.width < BOTTOM_BAR_MAX_WIDTH,
      "tablets and desktops only",
    );

    const navigation = await navigationBox(page);

    expect(navigation.x).toBe(0);
    expect(navigation.height).toBeCloseTo(viewport.height, 0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the floating bar has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/history");
      await expect(
        page.getByRole("heading", { level: 1, name: "History" }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("on Android", () => {
  test.use(onPlatform("android"));

  test("keeps the bottom bar full width on phones", async ({ page }) => {
    await page.goto("/");
    const viewport = viewportOf(page);
    test.skip(viewport.width >= BOTTOM_BAR_MAX_WIDTH, "phones only");

    const bar = await navigationBox(page);

    expect(bar.x).toBe(0);
    expect(bar.width).toBeCloseTo(viewport.width, 0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the navigation has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/history");
      await expect(
        page.getByRole("heading", { level: 1, name: "History" }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
