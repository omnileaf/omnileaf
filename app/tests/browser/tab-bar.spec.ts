import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const NARROW_PHONE = { width: 360, height: 780 };

function insetOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.inlineSize = "var(--spacing-lg)";
    document.body.append(probe);
    const inset = probe.getBoundingClientRect().width;
    probe.remove();
    return inset;
  });
}

function navigationBox(page: Page) {
  return boxOf(page.getByRole("navigation", { name: "Main" }));
}

test.describe("on iOS", () => {
  testOnlyInItsWebview("ios");
  test.use(onPlatform("ios"));

  test("floats the bottom bar inset from the screen's edges on phones", async ({
    page,
  }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");

    const bar = await navigationBox(page);

    expect(bar.x).toBeGreaterThan(0);
    expect(bar.x + bar.width).toBeLessThan(viewport.width);
    expect(bar.y + bar.height).toBeLessThan(viewport.height);
    await expect(page.getByRole("navigation", { name: "Main" })).not.toHaveCSS(
      "border-radius",
      "0px",
    );
  });

  test("keeps the floating bar inside its insets on a 360-point phone", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_PHONE);
    await page.goto("/");

    const bar = await navigationBox(page);
    const inset = await insetOf(page);

    expect(bar.x).toBeGreaterThanOrEqual(inset);
    expect(bar.x + bar.width).toBeLessThanOrEqual(NARROW_PHONE.width - inset);
  });

  test("leaves room under the page so the floating bar never covers content", async ({
    page,
  }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");

    const bar = await navigationBox(page);
    const clearance = await page
      .getByRole("main")
      .evaluate((main) => parseFloat(getComputedStyle(main).paddingBlockEnd));

    expect(clearance).toBeGreaterThanOrEqual(viewport.height - bar.y);
  });

  test("keeps the rail and sidebar on tablets and desktops", async ({
    page,
  }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width < MEDIUM_MIN_WIDTH, "tablets and desktops only");
    await page.goto("/");

    const navigation = await navigationBox(page);

    expect(navigation.x).toBe(0);
    expect(navigation.height).toBeCloseTo(viewport.height, 0);
  });

  test("shrinks the bar on the search page to a circle at the bottom start leading back to the library", async ({
    page,
  }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/search");
    const navigation = page.getByRole("navigation", { name: "Main" });

    await expect(navigation.getByRole("link")).toHaveCount(1);
    await expect(
      navigation.getByRole("link", { name: "Back to the library" }),
    ).not.toHaveAttribute("aria-current");
    const circle = await navigationBox(page);
    expect([circle.x, circle.width, circle.height]).toEqual([16, 48, 48]);
  });

  test("keeps every tab in the rail on the search page on tablets", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "tablets only");
    await page.goto("/search");

    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link"),
    ).toHaveCount(4);
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

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("on Android", () => {
  testOnlyInItsWebview("android");
  test.use(onPlatform("android"));

  test("keeps the bottom bar full width on phones", async ({ page }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/");

    const bar = await navigationBox(page);

    expect(bar.x).toBe(0);
    expect(bar.width).toBeCloseTo(viewport.width, 0);
  });

  test("keeps every tab in the full width bottom bar on the search page", async ({
    page,
  }) => {
    const viewport = viewportOf(page);
    test.skip(viewport.width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/search");

    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link"),
    ).toHaveCount(4);
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

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});
