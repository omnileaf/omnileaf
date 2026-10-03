import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const ACCENT = "rgb(47, 111, 79)";
const POINTER_ROW_HEIGHT = 44;

function sectionList(page: Page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

test.describe("on a desktop", () => {
  test.use(onPlatform("linux"));

  test("opens the first settings section beside the list from 600px", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");

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

  test("switches settings sections from the list", async ({ page }) => {
    await page.goto("/settings/library");
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");

    await sectionList(page).getByRole("link", { name: "About" }).click();

    await expect(page).toHaveURL("/settings/about");
    await expect(
      sectionList(page).getByRole("link", { name: "About" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Back to Settings" }),
    ).toBeHidden();
  });

  test("marks the open section in the accent on 44px rows", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");
    const open = sectionList(page).getByRole("link", { name: "Appearance" });

    const row = await boxOf(open);

    await expect(open).toHaveCSS("color", ACCENT);
    await expect(open).toHaveCSS("font-weight", "700");
    expect(row.height).toBe(POINTER_ROW_HEIGHT);
  });

  test("leads a section back to settings through a link under 600px", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "one pane only");

    const back = page.getByRole("link", { name: "Back to Settings" });

    await expect(sectionList(page)).toBeHidden();
    await expect(back).toHaveText("Settings");
    expect((await boxOf(back)).height).toBe(32);
  });
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test("keeps the settings sections to their own page below the sidebar width", async ({
      page,
    }) => {
      await page.goto("/settings/about");
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "below the sidebar width only",
      );

      await expect(sectionList(page)).toBeHidden();
      await expect(
        page.getByRole("link", { name: "Back to Settings" }),
      ).toBeVisible();
    });

    test("leads a section back to settings with a 48px arrow on a tablet", async ({
      page,
    }) => {
      await page.goto("/settings/about");
      const { width } = viewportOf(page);
      test.skip(
        width < MEDIUM_MIN_WIDTH || width >= EXPANDED_MIN_WIDTH,
        "rail width only",
      );
      const back = await boxOf(
        page.getByRole("link", { name: "Back to Settings" }),
      );
      const title = await boxOf(
        page.getByRole("heading", { level: 1, name: "About" }),
      );

      expect(back.width).toBe(48);
      expect(back.height).toBe(48);
      expect(back.y).toBe(8);
      expect(title.y).toBeGreaterThanOrEqual(back.y + back.height);
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`settings on desktop has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
