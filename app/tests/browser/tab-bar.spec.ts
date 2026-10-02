import { AxeBuilder } from "@axe-core/playwright";

import type { Page } from "@playwright/test";

import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

function navigationBox(page: Page) {
  return boxOf(page.getByRole("navigation", { name: "Main" }));
}

test.describe("on iOS", () => {
  test.use(onPlatform("ios"));

  test("floats the bottom bar inset from the screen's edges on phones", async ({
    page,
  }) => {
    await page.goto("/");
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");

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
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");

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
    test.skip(viewport.width < MEDIUM_MIN_WIDTH, "tablets and desktops only");

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
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");

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
