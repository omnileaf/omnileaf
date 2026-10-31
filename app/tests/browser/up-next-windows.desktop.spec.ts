import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  readerBook,
  servePages,
} from "./reader-book.ts";
import {
  BUTTON_HEIGHT,
  colourOf,
  escapedForPattern,
  NO_SHADOW,
  tabTo,
  THEMES,
} from "./windows-look.ts";

const WINDOW = { width: 1280, height: 800 };
const SUMMARY = {
  readSeconds: 72 * 60,
  pageCount: PAGE_COUNT,
  secondsPerPage: 23,
};
const FINISHED = `${BOOK_TITLE} finished`;
const READ_NEXT = `Read ${NEXT_BOOK.title}`;
const PAGE_MARGIN = "24px";
async function useScheme(
  page: Page,
  colorScheme: "light" | "dark",
): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.addInitScript((scheme) => {
    localStorage.setItem(
      "omnileaf.readerSettings.all",
      JSON.stringify({ controls: scheme === "light" ? "matchApp" : "dark" }),
    );
  }, colorScheme);
}

async function turnPastTheEnd(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("img", { name: `Page ${String(PAGE_COUNT)}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { level: 2, name: FINISHED }),
  ).toBeVisible();
}

function upNextCard(page: Page): Locator {
  return page.locator("[data-slot=card]").filter({
    has: page.getByRole("heading", { level: 2, name: "Up next" }),
  });
}

function stats(page: Page): Locator {
  return page.getByRole("group", { name: `Reading stats for ${BOOK_TITLE}` });
}

function readNext(page: Page): Locator {
  return page.getByRole("link", { name: READ_NEXT });
}

function backToSeries(page: Page): Locator {
  return page.getByRole("link", { name: "Back to the series" });
}

function skipSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Skip this screen" });
}

test.describe("up next on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use({
    viewport: WINDOW,
    platform: "windows",
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      readingSummary: () => SUMMARY,
    },
  });

  test.beforeEach(async ({ page }) => {
    await servePages(page);
  });

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await useScheme(page, colorScheme as "light" | "dark");
        await turnPastTheEnd(page);
      });

      for (const [name, card] of [
        ["Up next card", upNextCard],
        ["reading stats", stats],
      ] as const) {
        test(`draws the ${name} as a flat layer with a 1px stroke and 8px corners`, async ({
          page,
        }) => {
          const drawn = card(page);

          await expect(drawn).toHaveCSS("background-color", look.card);
          await expect(drawn).toHaveCSS("border-top-width", "1px");
          await expect(drawn).toHaveCSS(
            "border-top-color",
            await colourOf(page, "var(--windows-stroke)"),
          );
          await expect(drawn).toHaveCSS("border-top-left-radius", "8px");
          await expect(drawn).toHaveCSS("box-shadow", NO_SHADOW);
        });
      }

      test("keeps the page margin at 24 beside the card", async ({ page }) => {
        const scroller = upNextCard(page).locator("xpath=ancestor::section/..");

        await expect(scroller).toHaveCSS("padding-inline-start", PAGE_MARGIN);
        await expect(scroller).toHaveCSS("padding-inline-end", PAGE_MARGIN);
      });

      test("draws Read next as the accent button and Back to the series as the standard button, 32 tall with 4px corners", async ({
        page,
      }) => {
        const read = readNext(page);
        const back = backToSeries(page);

        await expect(read).toHaveCSS("background-color", look.accent);
        await expect(read).toHaveCSS("color", look.onAccent);
        await expect(back).toHaveCSS("background-color", look.standard);
        await expect(back).toHaveCSS(
          "border-bottom-color",
          look.standardBottomEdge,
        );
        for (const button of [read, back]) {
          await expect(button).toHaveCSS("border-top-left-radius", "4px");
          await expect(button).toHaveCSS("font-size", "14px");
          expect((await boxOf(button)).height).toBe(BUTTON_HEIGHT);
        }
        const readBox = await boxOf(read);
        const backBox = await boxOf(back);
        expect(backBox.x).toBeGreaterThan(readBox.x + readBox.width);
        expect(backBox.y).toBe(readBox.y);
      });

      test("draws the next book's cover with 4px corners", async ({ page }) => {
        await expect(page.locator("[data-up-next-cover]")).toHaveCSS(
          "border-top-left-radius",
          "4px",
        );
      });

      test("rings the focused buttons and the switch with the two-tone focus rectangle", async ({
        page,
      }) => {
        for (const control of [
          readNext(page),
          backToSeries(page),
          skipSwitch(page),
        ]) {
          await tabTo(page, control);

          await expect(control).toHaveCSS("outline-width", "2px");
          await expect(control).toHaveCSS("outline-color", look.ring);
          await expect(control).toHaveCSS("outline-offset", "1px");
          await expect(control).toHaveCSS(
            "box-shadow",
            new RegExp(escapedForPattern(look.innerRing)),
          );
        }
      });

      test("has no accessibility violations at rest and with a button focused", async ({
        page,
      }) => {
        expect(await accessibilityViolations(page)).toEqual([]);

        await tabTo(page, readNext(page));

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }

  test.describe("by keyboard", () => {
    test.beforeEach(async ({ page }) => {
      await turnPastTheEnd(page);
    });

    test("moves the key hints out of the buttons into tooltips and aria-keyshortcuts", async ({
      page,
    }) => {
      await expect(readNext(page).locator("kbd")).toHaveCount(0);
      await expect(backToSeries(page).locator("kbd")).toHaveCount(0);
      await expect(readNext(page)).toHaveAttribute(
        "aria-keyshortcuts",
        "ArrowRight",
      );
      await expect(backToSeries(page)).toHaveAttribute(
        "aria-keyshortcuts",
        "Escape",
      );

      await tabTo(page, backToSeries(page));

      await expect(page.getByText("Esc", { exact: true })).toBeVisible();
    });

    test("tabs from the title to Read next, Back to the series and the switch in that order", async ({
      page,
    }) => {
      await page.getByRole("heading", { level: 2, name: FINISHED }).focus();

      for (const control of [
        readNext(page),
        backToSeries(page),
        skipSwitch(page),
      ]) {
        await page.keyboard.press("Tab");
        await expect(control).toBeFocused();
      }
    });

    test("still starts the next book from Read next and returns to the series from Back", async ({
      page,
    }) => {
      await readNext(page).click();

      await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    });
  });

  test.describe("with forced colours on", () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await turnPastTheEnd(page);
    });

    test("draws Read next on Highlight and keeps the card edged", async ({
      page,
    }) => {
      await expect(readNext(page)).toHaveCSS(
        "background-color",
        await colourOf(page, "Highlight"),
      );
      await expect(readNext(page)).toHaveCSS(
        "color",
        await colourOf(page, "HighlightText"),
      );
      await expect(upNextCard(page)).toHaveCSS("border-top-width", "1px");
      await expect(upNextCard(page)).not.toHaveCSS(
        "border-top-color",
        "rgba(0, 0, 0, 0)",
      );
    });
  });
});

test.describe("the end of a series on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use({
    viewport: WINDOW,
    platform: "windows",
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({
        ...readerBook(NOT_STARTED),
        id,
        next: null,
      }),
      readingSummary: () => null,
    },
  });

  test("draws Back to the series as the accent button and Library as the standard button", async ({
    page,
  }) => {
    await useScheme(page, "light");
    await servePages(page);
    await turnPastTheEnd(page);
    const library = page.getByRole("link", { name: "Back to the library" });

    await expect(backToSeries(page)).toHaveCSS(
      "background-color",
      THEMES.light.accent,
    );
    await expect(library).toHaveCSS("background-color", THEMES.light.standard);
    for (const button of [backToSeries(page), library]) {
      expect((await boxOf(button)).height).toBe(BUTTON_HEIGHT);
    }
  });
});

test.describe("up next on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({
    viewport: WINDOW,
    platform: "linux",
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      readingSummary: () => SUMMARY,
    },
  });

  test("keeps Linux's key hints inside the buttons", async ({ page }) => {
    await servePages(page);
    await turnPastTheEnd(page);

    await expect(readNext(page).locator("kbd")).toBeVisible();
    await expect(backToSeries(page).locator("kbd")).toBeVisible();
    await expect(upNextCard(page)).not.toHaveCSS(
      "background-color",
      THEMES.light.card,
    );
  });
});
