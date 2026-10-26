import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const POINTER_ROW_HEIGHT = 32;
const SECTIONS_IN_ORDER = [
  "General",
  "Appearance",
  "Library",
  "Reader",
  "Privacy and security",
  "Storage",
  "Advanced",
  "About",
];
const NARROW_BACK_LINK_HEIGHT = 32;
const TOUCH_TARGET = 48;
const STATUS_BAR_GAP = 8;
const IOS_BACK_LINK_TEXT = "17px";
const SECTIONS_TITLE_TEXT = "12px";
const SEMIBOLD = "600";

function sectionList(page: Page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

test.describe("on a desktop", () => {
  test.use(onPlatform("linux"));

  test("opens the first settings section beside the list from 840px", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .click();

    await expect(page).toHaveURL("/settings/general");
    await expect(
      page.getByRole("heading", { level: 1, name: "General" }),
    ).toBeFocused();
    await expect(
      sectionList(page).getByRole("link", { name: "General" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("opens Settings on its list of pages under 840px", async ({ page }) => {
    test.skip(viewportOf(page).width >= EXPANDED_MIN_WIDTH, "one pane only");
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .click();

    await expect(page).toHaveURL("/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeFocused();
    await expect(sectionList(page)).toBeHidden();
    await expect(
      page.getByRole("main").getByRole("link", { name: /^General/ }),
    ).toBeVisible();
  });

  test("lists the sections in the phone's order", async ({ page }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/general");

    await expect(sectionList(page).getByRole("link")).toHaveText(
      SECTIONS_IN_ORDER,
    );
  });

  test("names where a page sits in a breadcrumb bar, with an arrow back from a nested page", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/advanced/animations");
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });

    await expect(trail.getByRole("link")).toHaveText(["Settings", "Advanced"]);
    await expect(trail.locator('[aria-current="page"]')).toHaveText(
      "Animations",
    );
    await page.getByRole("link", { name: "Back to Advanced" }).click();

    await expect(page).toHaveURL("/settings/advanced");
  });

  test("draws the arrow back from a nested page in the foreground colour", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/advanced/animations");

    await expect(
      page.getByRole("link", { name: "Back to Advanced" }),
    ).toHaveCSS("color", await tokenColour(page, "--foreground"));
  });

  test("titles the sections list in small semibold muted text", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/general");
    const title = sectionList(page)
      .locator("..")
      .getByText("Settings", { exact: true });

    await expect(title).toHaveCSS("font-size", SECTIONS_TITLE_TEXT);
    await expect(title).toHaveCSS("font-weight", SEMIBOLD);
    await expect(title).toHaveCSS(
      "color",
      await tokenColour(page, "--muted-foreground"),
    );
  });

  test("focuses the first settings section's heading without a focus ring when opened from the keyboard", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .press("Enter");

    const heading = page.getByRole("heading", { level: 1, name: "General" });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS("outline-style", "none");
  });

  test("switches settings sections from the list", async ({ page }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/library");

    await sectionList(page).getByRole("link", { name: "About" }).click();

    await expect(page).toHaveURL("/settings/about");
    await expect(
      sectionList(page).getByRole("link", { name: "About" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Back to Settings" }),
    ).toBeHidden();
  });

  test("marks the open section in the sidebar's accent on 32px rows", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.goto("/settings/appearance");
    const open = sectionList(page).getByRole("link", { name: "Appearance" });

    const row = await boxOf(open);

    await expect(open).toHaveCSS(
      "background-color",
      await tokenColour(page, "--sidebar-accent"),
    );
    await expect(open).toHaveCSS("font-weight", "500");
    expect(row.height).toBe(POINTER_ROW_HEIGHT);
  });

  test("leads a section back to settings through a link under 840px", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= EXPANDED_MIN_WIDTH, "one pane only");
    await page.goto("/settings/about");

    const back = page.getByRole("link", { name: "Back to Settings" });

    await expect(sectionList(page)).toBeHidden();
    await expect(back).toHaveText("Settings");
    expect((await boxOf(back)).height).toBe(NARROW_BACK_LINK_HEIGHT);
  });
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test("keeps the settings sections to their own page below the sidebar width", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "below the sidebar width only",
      );
      await page.goto("/settings/about");

      await expect(sectionList(page)).toBeHidden();
      await expect(
        page.getByRole("link", { name: "Back to Settings" }),
      ).toBeVisible();
    });

    test("leads a section back to settings with a 48px arrow on a tablet", async ({
      page,
    }) => {
      const { width } = viewportOf(page);
      test.skip(
        width < MEDIUM_MIN_WIDTH || width >= EXPANDED_MIN_WIDTH,
        "rail width only",
      );
      await page.goto("/settings/about");
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
  testOnlyInItsWebview("ios");
  test.use(onPlatform("ios"));

  test("leads a section back to settings with a 17px chevron and label", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
    await page.goto("/settings/about");

    const back = page.getByRole("link", { name: "Back to Settings" });

    await expect(back).toHaveText("Settings");
    await expect(back).toHaveCSS("font-size", IOS_BACK_LINK_TEXT);
    await expect(back).toHaveCSS("font-weight", "500");
    expect((await boxOf(back)).height).toBe(TOUCH_TARGET);
  });
});

for (const platform of ["android", "ios", "linux"] as const) {
  test.describe(`on ${platform} in a right-to-left language`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test("points the way back to settings toward the start of the line", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
      await page.goto("/settings/about");
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
    testOnlyInItsWebview(platform);
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
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "two panes only");
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "General" }),
    ).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
