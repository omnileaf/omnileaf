import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  onPlatform,
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

    test("has no accessibility violations with the bars shown", async ({
      page,
    }) => {
      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });
}
