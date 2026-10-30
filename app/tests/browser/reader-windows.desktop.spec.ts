import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const SETTINGS_KEY = "omnileaf.readerSettings.all";
const COMMAND_BUTTON = { width: 68, height: 64 };
const MORE_WIDTH = 48;
const BAR_EDGE = 1;
const RING_ROOM = 4;
const NO_FILL = /^rgba\(\d+, \d+, \d+, 0\)$/;
const SLIDER_HEIGHT = 32;
const THUMB = 18;

const THEMES = {
  dark: { settings: {}, bar: "rgba(44, 44, 44, 0.96)" },
  light: {
    settings: { controls: "matchApp" },
    bar: "rgba(252, 252, 252, 0.85)",
  },
} as const;

testOnlyInItsWebview("windows");

test.use({
  backend: readerBackend(onPlatform("windows").backend, NOT_STARTED),
});

async function openBook(
  page: Page,
  look: Record<string, string>,
  colorScheme: "light" | "dark",
): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
    },
    [SETTINGS_KEY, JSON.stringify(look)] as const,
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function bottomBar(page: Page): Locator {
  return page.locator('[data-reader-bar="bottom"]');
}

function topBar(page: Page): Locator {
  return page.locator('[data-reader-bar="top"]');
}

async function systemColour(page: Page, keyword: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = name;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, keyword);
}

function layerOf(button: Locator): Promise<{ fill: string; outline: string }> {
  return button.evaluate((element) => {
    const layer = getComputedStyle(element, "::before");
    return { fill: layer.backgroundColor, outline: layer.outlineStyle };
  });
}

for (const [scheme, theme] of Object.entries(THEMES)) {
  test.describe(`in the ${scheme} chrome`, () => {
    test.beforeEach(async ({ page }) => {
      await openBook(page, theme.settings, scheme as "light" | "dark");
    });

    test("spans the window as a command bar on acrylic along the top edge", async ({
      page,
    }) => {
      const bar = await boxOf(topBar(page));

      expect(bar.x).toBe(0);
      expect(bar.y).toBe(0);
      expect(bar.width).toBe(viewportOf(page).width);
      expect(bar.height).toBe(COMMAND_BUTTON.height + RING_ROOM + BAR_EDGE);
      await expect(topBar(page)).toHaveCSS("background-color", theme.bar);
    });

    test("spans the window as a bar on acrylic along the bottom edge", async ({
      page,
    }) => {
      const bar = await boxOf(bottomBar(page));
      const { width, height } = viewportOf(page);

      expect(bar.x).toBe(0);
      expect(bar.width).toBe(width);
      expect(bar.y + bar.height).toBe(height);
      await expect(bottomBar(page)).toHaveCSS("background-color", theme.bar);
      await expect(bottomBar(page)).toHaveCSS("border-top-width", "1px");
    });

    test("draws the page slider 32 tall with an 18 thumb", async ({ page }) => {
      const slider = page.locator("[data-slider-root]");
      const thumb = page.locator("[data-progress-thumb]");

      expect((await boxOf(slider)).height).toBe(SLIDER_HEIGHT);
      expect(await boxOf(thumb)).toMatchObject({
        width: THUMB,
        height: THUMB,
      });
    });

    test("labels the reader's commands under their icons in 68 wide buttons", async ({
      page,
    }) => {
      for (const name of [
        "Keyboard shortcuts",
        "Reading settings",
        "Full screen",
      ]) {
        const box = await boxOf(page.getByRole("button", { name }));

        expect({ name, ...box }).toMatchObject({ name, ...COMMAND_BUTTON });
      }
      expect(
        (await boxOf(page.getByRole("button", { name: "More" }))).width,
      ).toBe(MORE_WIDTH);
    });

    test("paints a switched on command in Highlight and an off one with no fill in forced colours", async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        forcedColors: "active",
      });
      const twoPages = page.getByRole("button", { name: "Two pages" });
      const fitHeight = page.getByRole("button", { name: "Fit height" });
      const highlight = await systemColour(page, "Highlight");
      const highlightText = await systemColour(page, "HighlightText");

      await twoPages.click();
      await page.mouse.move(0, 400);

      await expect
        .poll(async () => (await layerOf(twoPages)).fill)
        .toBe(highlight);
      await expect(twoPages).toHaveCSS("color", highlightText);
      expect((await layerOf(fitHeight)).fill).toMatch(NO_FILL);
    });

    test("outlines a hovered command in forced colours, where its tint would vanish", async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        forcedColors: "active",
      });
      const settings = page.getByRole("button", { name: "Reading settings" });

      await page.mouse.move(0, 400);
      expect((await layerOf(settings)).outline).toBe("none");
      await settings.hover();

      await expect
        .poll(async () => (await layerOf(settings)).outline)
        .toBe("solid");
    });

    test("leaves a command that is not available without a hover outline in forced colours", async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        forcedColors: "active",
      });
      const bookmark = page.getByRole("button", { name: "Bookmark this page" });

      await expect(bookmark).toHaveAttribute("aria-disabled", "true");
      await bookmark.hover();

      expect((await layerOf(bookmark)).outline).toBe("none");
    });

    test("opens the reading settings as a flyout pane on acrylic with a 48 wide close button", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Reading settings" }).click();
      const pane = page.getByRole("complementary");

      await expect(pane).toBeVisible();
      await settle(pane);
      await expect(pane).toHaveCSS("background-color", theme.bar);
      await expect(pane).toHaveCSS("border-top-left-radius", "8px");
      await expect(pane).toHaveCSS("backdrop-filter", "blur(30px)");
      expect(
        (
          await boxOf(
            pane.getByRole("button", { name: "Close reading settings" }),
          )
        ).width,
      ).toBe(MORE_WIDTH);
      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test("has no accessibility violations with the bars shown", async ({
      page,
    }) => {
      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });
}

const NARROW = { width: 700, height: 600 };

test.describe("in a window narrower than the wide layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(NARROW);
    await openBook(page, THEMES.dark.settings, "dark");
  });

  test("opens the reading settings as a pane, never a bottom sheet", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Reading settings" }).click();

    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("opens Jump to a book as a flyout pane on acrylic, never a bottom sheet", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /Jump to a book/ })
      .first()
      .click();
    const pane = page.getByRole("complementary");

    await expect(pane).toBeVisible();
    await settle(pane);
    await expect(pane).toHaveCSS("background-color", THEMES.dark.bar);
    await expect(pane).toHaveCSS("border-top-left-radius", "8px");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("keeps the pane clear of the bottom bar's controls", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Reading settings" }).click();
    const pane = page.getByRole("complementary");

    await expect(pane).toBeVisible();
    await settle(pane);

    const paneEdge = (await boxOf(pane)).x;

    await expect
      .poll(async () => {
        const bar = await boxOf(bottomBar(page));
        return bar.x + bar.width;
      })
      .toBeLessThanOrEqual(paneEdge);
  });

  for (const [name, opener, closer] of [
    ["reading settings", "Reading settings", "Close reading settings"],
    ["Jump to a book", /Jump to a book/, "Close Jump to a book"],
  ] as const) {
    test(`moves focus into the ${name} pane and gives it back to the opener on Escape`, async ({
      page,
    }) => {
      const button = page.getByRole("button", { name: opener }).first();

      await button.click();
      const pane = page.getByRole("complementary");
      await expect(pane).toBeVisible();

      await expect(pane.getByRole("button", { name: closer })).toBeFocused();
      await page.keyboard.press("Escape");

      await expect(pane).toBeHidden();
      await expect(button).toBeFocused();
    });
  }

  test("leaves the page and bottom bar out of reach while the pane covers the window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 600 });
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.getByRole("complementary")).toBeVisible();

    expect(
      await bottomBar(page).evaluate(
        (element) => element.closest("[inert]") !== null,
      ),
    ).toBe(true);
  });
});
