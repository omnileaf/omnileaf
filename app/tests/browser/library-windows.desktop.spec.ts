import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  onPlatform,
  settle,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(14);
const COMMAND_WIDTH = 68;
const COMMAND_HEIGHT = 64;
const PAGE_MARGIN = 24;

const INK = {
  light: "rgba(0, 0, 0, 0.894)",
  dark: "rgb(255, 255, 255)",
} as const;

const ACCENT = {
  light: "rgb(47, 111, 79)",
  dark: "rgb(127, 203, 157)",
} as const;

const WINDOWS = onPlatform("windows").backend;

function commandBar(page: Page): Locator {
  return page.locator("[data-page-toolbar]");
}

function command(page: Page, name: string): Locator {
  return commandBar(page).getByRole("button", { name });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

test.describe("Windows library header", () => {
  testOnlyInItsWebview("windows");
  test.use({
    backend: {
      ...WINDOWS,
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await openLibrary(page);
      });

      test("sets Filter and View as labelled 68 by 64 commands beside a Title", async ({
        page,
      }) => {
        const title = page.getByRole("heading", { name: "Library" });

        await expect(title).toHaveCSS("font-size", "28px");
        await expect(title).toHaveCSS("font-weight", "600");
        await expect(title).toHaveCSS("color", INK[colorScheme]);
        for (const name of ["Sort and filter", "View options"]) {
          const box = await boxOf(command(page, name));
          expect(box.width).toBe(COMMAND_WIDTH);
          expect(box.height).toBe(COMMAND_HEIGHT);
        }
        await expect(command(page, "Sort and filter")).toContainText("Filter");
        await expect(command(page, "View options")).toContainText("View");
      });

      test("keeps the title 24 from the pane and the covers 24 from the edge of the page", async ({
        page,
      }) => {
        const bar = await boxOf(commandBar(page));
        const firstCover = await boxOf(
          page
            .getByRole("list", { name: "Series" })
            .getByRole("listitem")
            .first(),
        );

        expect(firstCover.x - bar.x).toBe(PAGE_MARGIN);
      });

      test("lights a command under the pointer and fills it with the accent while its panel is open", async ({
        page,
      }) => {
        const filter = command(page, "Sort and filter");
        const layer = (): Promise<string> =>
          filter.evaluate(
            (element) => getComputedStyle(element, "::before").backgroundColor,
          );
        const idle = await layer();

        await filter.hover();
        await settle(filter);
        const hovered = await layer();
        await filter.click();
        await page.mouse.move(0, 0);
        await settle(filter);
        const open = await layer();

        expect(hovered).not.toBe(idle);
        expect(open).toBe(ACCENT[colorScheme]);
      });

      test("rings a command reached by the keyboard twice, an outer 2 and an inner 1", async ({
        page,
      }) => {
        const filter = command(page, "Sort and filter");

        await filter.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");

        await expect(filter).toBeFocused();
        await expect(filter).toHaveCSS("outline-width", "2px");
        await expect(filter).not.toHaveCSS("box-shadow", "none");
      });

      test("has no accessibility violations", async ({ page }) => {
        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }

  test("paints a hovered command on Highlight under forced colours", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openLibrary(page);
    const view = command(page, "View options");

    await view.hover();
    await settle(view);

    const [layer, highlight, ink, highlightText] = await view.evaluate(
      (element) => {
        const probe = document.createElement("div");
        probe.style.cssText =
          "background-color: Highlight; color: HighlightText";
        document.body.append(probe);
        const drawn = getComputedStyle(probe);
        const values = [
          getComputedStyle(element, "::before").backgroundColor,
          drawn.backgroundColor,
          getComputedStyle(element).color,
          drawn.color,
        ];
        probe.remove();
        return values;
      },
    );
    expect(layer).toBe(highlight);
    expect(ink).toBe(highlightText);
  });
});
