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
  return page
    .getByRole("slider")
    .locator("xpath=ancestor::div[contains(@class,'flex-col')][1]");
}

function topBar(page: Page): Locator {
  return page.locator("main header > div").first();
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
      expect(bar.height).toBe(COMMAND_BUTTON.height + BAR_EDGE);
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

    test("keeps a hovered command and a switched on one visible in forced colours", async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: scheme as "light" | "dark",
        forcedColors: "active",
      });
      const twoPages = page.getByRole("button", { name: "Two pages" });
      const settings = page.getByRole("button", { name: "Reading settings" });

      await twoPages.click();
      await settings.hover();

      await expect
        .poll(() =>
          twoPages.evaluate((element) => {
            const layer = getComputedStyle(element, "::before");
            const text = getComputedStyle(element).color;
            return layer.backgroundColor !== text;
          }),
        )
        .toBe(true);
      await expect
        .poll(() =>
          settings.evaluate((element) => {
            const layer = getComputedStyle(element, "::before");
            return layer.outlineStyle;
          }),
        )
        .toBe("solid");
    });

    test("opens the reading settings as a flyout pane on acrylic with a 4 cornered close button", async ({
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
