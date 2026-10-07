import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
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
const NARROW_BACK_LINK_HEIGHT = 32;
const TOUCH_TARGET = 48;
const STATUS_BAR_GAP = 8;
const IOS_BACK_LINK_TEXT = "17px";

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

  test("focuses the first settings section's heading without a focus ring when opened from the keyboard", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "two panes only");

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .press("Enter");

    const heading = page.getByRole("heading", { level: 1, name: "Library" });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS("outline-style", "none");
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
    expect((await boxOf(back)).height).toBe(NARROW_BACK_LINK_HEIGHT);
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

      expect(back.width).toBe(TOUCH_TARGET);
      expect(back.height).toBe(TOUCH_TARGET);
      expect(back.y).toBe(STATUS_BAR_GAP);
      expect(title.y).toBeGreaterThanOrEqual(back.y + back.height);
    });
  });
}

test.describe("on an iOS phone", () => {
  test.use(onPlatform("ios"));

  test("leads a section back to settings with a 17px chevron and label", async ({
    page,
  }) => {
    await page.goto("/settings/about");
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");

    const back = page.getByRole("link", { name: "Back to Settings" });

    await expect(back).toHaveText("Settings");
    await expect(back).toHaveCSS("font-size", IOS_BACK_LINK_TEXT);
    await expect(back).toHaveCSS("font-weight", "500");
    expect((await boxOf(back)).height).toBe(TOUCH_TARGET);
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`on ${platform} in a right-to-left language`, () => {
    test.use(onPlatform(platform));

    test("points the way back to settings toward the start of the line", async ({
      page,
    }) => {
      await page.goto("/settings/about");
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      const back = page.getByRole("link", { name: "Back to Settings" });
      await expect(back).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.dir = "rtl";
      });

      const icon = back.locator("svg:visible");

      await expect(icon).toHaveCSS("scale", "-1 1");
    });
  });
}

for (const { platform, gap } of [
  { platform: "linux", gap: 20 },
  { platform: "android", gap: 24 },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    for (const { path, region } of [
      { path: "/settings/library", region: "Home folder" },
      { path: "/settings/appearance", region: "Light or dark" },
    ] as const) {
      test(`spaces ${path} ${String(gap)}px under its title`, async ({
        page,
      }) => {
        await page.goto(path);

        const header = await boxOf(
          page.getByRole("heading", { level: 1 }).locator(".."),
        );
        const content = await boxOf(page.getByRole("region", { name: region }));

        expect(content.y - (header.y + header.height)).toBe(gap);
      });
    }
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

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
