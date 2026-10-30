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

const LIBRARY = sampleSeries(14).map((series, index) => ({
  ...series,
  language: index % 2 === 0 ? "en" : null,
  hasDownloads: index % 3 === 0,
}));

function titleOf(index: number): string {
  const series = LIBRARY[index];
  if (series === undefined) {
    throw new Error(`the fixture lists no series at ${String(index)}`);
  }
  return series.title;
}

const FIRST_TITLE = titleOf(0);
const SECOND_TITLE = titleOf(1);
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

test.describe("Windows library", () => {
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

      test("keeps the covers 24 from the edge of the page", async ({
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

      test("opens the view options with segmented choices that raise the chosen segment on an accent pill", async ({
        page,
      }) => {
        await command(page, "View options").click();

        const display = page.getByRole("radiogroup", { name: "Display" });
        await expect(display).toBeVisible();
        await expect(display).toHaveCSS("border-top-width", "1px");
        await expect(display).toHaveCSS("border-top-left-radius", "4px");
        const pill = await display
          .getByRole("radio", { name: "Grid" })
          .evaluate(
            (element) => getComputedStyle(element, "::after").backgroundColor,
          );
        expect(pill).toBe(ACCENT[colorScheme]);
        expect(await accessibilityViolations(page)).toEqual([]);
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

  test.describe("tiles", () => {
    test.beforeEach(async ({ page }) => {
      await openLibrary(page);
    });

    function cell(page: Page, title: string): Locator {
      return page
        .getByRole("list", { name: "Series" })
        .getByRole("listitem")
        .filter({ hasText: title });
    }

    function edge(link: Locator): Promise<string> {
      return link.evaluate(
        (element) => getComputedStyle(element, "::before").borderTopColor,
      );
    }

    test("reveals a check box on hover where the language and download tags sit, and lifts the tags off it", async ({
      page,
    }) => {
      const first = cell(page, FIRST_TITLE);
      const check = first.getByRole("checkbox", {
        name: `Select ${FIRST_TITLE}`,
      });
      const tags = first.locator('[data-slot="cover-tags"]');
      await expect(check).toHaveCSS("opacity", "0");
      await expect(tags).toHaveCSS("opacity", "1");

      await first.hover();

      await expect(check).toHaveCSS("opacity", "1");
      await expect(tags).toHaveCSS("opacity", "0");
      const target = await boxOf(check);
      const drawn = await boxOf(check.locator('[data-slot="tile-check-box"]'));
      expect([target.width, target.height, drawn.width, drawn.height]).toEqual([
        24, 24, 20, 20,
      ]);
    });

    test("starts selecting from the check box and rings the picked tile's edge in the accent", async ({
      page,
    }) => {
      const first = cell(page, FIRST_TITLE);
      await first.hover();

      await first
        .getByRole("checkbox", { name: `Select ${FIRST_TITLE}` })
        .click();

      await expect(page.getByText("1 selected")).toBeVisible();
      const link = first.locator("[data-pickable-link]");
      await expect(link).toHaveAttribute("aria-checked", "true");
      await settle(link);
      expect(await edge(link)).toBe(ACCENT.light);
      expect(
        await edge(cell(page, SECOND_TITLE).locator("[data-pickable-link]")),
      ).toBe("rgba(0, 0, 0, 0)");
    });

    test("rings a tile reached by the keyboard twice, an outer 2 and an inner 1", async ({
      page,
    }) => {
      const link = cell(page, FIRST_TITLE).locator("[data-pickable-link]");

      await link.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");

      await expect(link).toBeFocused();
      const [width, shadow] = await link.evaluate((element) => {
        const ring = getComputedStyle(element, "::before");
        return [ring.outlineWidth, ring.boxShadow];
      });
      expect(width).toBe("2px");
      expect(shadow).not.toBe("none");
    });

    test("lights a hovered tile at once when the person asks for less motion", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const link = cell(page, SECOND_TITLE).locator("[data-pickable-link]");

      await link.hover();

      const [duration, fill] = await link.evaluate((element) => {
        const box = getComputedStyle(element, "::before");
        return [box.transitionDuration, box.backgroundColor];
      });
      expect(duration).toBe("0s");
      expect(fill).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("has no accessibility violations at rest, hovered and selecting", async ({
      page,
    }) => {
      expect(await accessibilityViolations(page)).toEqual([]);

      await cell(page, FIRST_TITLE).hover();
      expect(await accessibilityViolations(page)).toEqual([]);

      await cell(page, FIRST_TITLE)
        .getByRole("checkbox", { name: `Select ${FIRST_TITLE}` })
        .click();
      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test("draws no edge round an idle tile under forced colours", async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      const link = cell(page, SECOND_TITLE).locator("[data-pickable-link]");

      expect(await edge(link)).toBe("rgba(0, 0, 0, 0)");
    });

    test("draws a picked tile's edge in Highlight under forced colours", async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      const first = cell(page, FIRST_TITLE);
      await first.hover();
      await first
        .getByRole("checkbox", { name: `Select ${FIRST_TITLE}` })
        .click();
      const link = first.locator("[data-pickable-link]");
      await settle(link);

      const [drawn, highlight] = await link.evaluate((element) => {
        const probe = document.createElement("div");
        probe.style.color = "Highlight";
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return [getComputedStyle(element, "::before").borderTopColor, colour];
      });
      expect(drawn).toBe(highlight);
    });
  });

  test.describe("selection bar", () => {
    test.beforeEach(async ({ page }) => {
      await openLibrary(page);
      const first = page
        .getByRole("list", { name: "Series" })
        .getByRole("listitem")
        .first();
      await first.hover();
      await first.getByRole("checkbox").click();
    });

    test("holds the selection's commands in a command bar at the top, with no bar at the bottom", async ({
      page,
    }) => {
      const bar = commandBar(page);

      for (const name of ["Select all", "Mark as read"]) {
        const box = await boxOf(bar.getByRole("button", { name }));
        expect([name, box.width >= COMMAND_WIDTH, box.height]).toEqual([
          name,
          true,
          COMMAND_HEIGHT,
        ]);
      }
      const groups = page.getByRole("group", { name: "Selected series" });
      await expect(groups).toHaveCount(1);
      await expect(
        bar.getByRole("group", { name: "Selected series" }),
      ).toHaveCount(1);
    });

    test("draws a turned-off command on no Highlight fill under forced colours, even under the pointer", async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await page
        .getByRole("list", { name: "Series" })
        .getByRole("listitem")
        .first()
        .locator("[data-pickable-link]")
        .click();
      const markRead = command(page, "Mark as read");
      await expect(markRead).toBeDisabled();

      await markRead.hover({ force: true });
      await settle(markRead);

      const [layer, ink, highlight, highlightText] = await markRead.evaluate(
        (element) => {
          const probe = document.createElement("div");
          probe.style.cssText =
            "background-color: Highlight; color: HighlightText";
          document.body.append(probe);
          const drawn = getComputedStyle(probe);
          const values = [
            getComputedStyle(element, "::before").backgroundColor,
            getComputedStyle(element).color,
            drawn.backgroundColor,
            drawn.color,
          ];
          probe.remove();
          return values;
        },
      );
      expect(layer).not.toBe(highlight);
      expect(ink).not.toBe(highlightText);
    });

    test("has no accessibility violations", async ({ page }) => {
      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });
});

test.describe("Windows empty library", () => {
  testOnlyInItsWebview("windows");
  test.use({ backend: WINDOWS });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`sets the empty state as a Subtitle over a Body in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      const title = page.getByRole("heading", {
        name: "Your library is empty",
      });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", "20px");
      await expect(title).toHaveCSS("line-height", "28px");
      await expect(title).toHaveCSS("font-weight", "600");
      await expect(page.getByText("Add a folder of")).toHaveCSS(
        "font-size",
        "14px",
      );
      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
