import type { Locator, Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import { boxOf, expect, test, tokenColour } from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const TONAL_BAR = "rgb(233, 240, 232)";
const OTHER_SERIES = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  cover: null,
  bookCount: 12,
  readCount: 0,
  reason: { kind: "sameWriter" },
  isAdult: false,
} as const;

const PIXEL_9_PRO = { width: 412, height: 915 };
const STATUS_BAR = 24;
const NAVIGATION_BAR = 24;
const TOP_APP_BAR = 64;
const HERO_GAP = 8;
const BUTTON_HEIGHT = 40;
const BUTTON_TYPE = "14px";
const EMPTY_STACK_GAP = 16;
const EMPTY_INSET = 24;
const READ = { state: "read" } as const;

async function openSeries(page: Page): Promise<void> {
  await page.addInitScript(
    ({ top, bottom }) => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement.style;
        root.setProperty("--system-inset-top", `${String(top)}px`);
        root.setProperty("--system-inset-bottom", `${String(bottom)}px`);
      });
    },
    { top: STATUS_BAR, bottom: NAVIGATION_BAR },
  );
  await page.goto(`/series/${SERIES_ID}`);
}

function topAppBar(page: Page): Locator {
  return page.getByRole("main").locator("header").first();
}

function backButton(page: Page): Locator {
  return page.getByRole("link", { name: "Back to the library" });
}

async function expectTopAppBarOverHero(page: Page, hero: Locator) {
  const [bar, back, below] = await Promise.all([
    boxOf(topAppBar(page)),
    boxOf(backButton(page)),
    boxOf(hero),
  ]);

  expect(bar.height).toBe(STATUS_BAR + TOP_APP_BAR);
  expect(back.y + back.height / 2).toBe(STATUS_BAR + TOP_APP_BAR / 2);
  expect(below.y).toBe(bar.y + bar.height + HERO_GAP);
}

test.describe(
  "A series page without a series to show on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = new FakeShelf([]);

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's top app bar");
    });

    test.describe("when it can't be read", () => {
      test.use({
        backend: {
          ...shelf.backend(),
          seriesOverview: () => {
            throw new CommandFailure({
              code: "internal",
              message: "the catalog couldn't be read",
            });
          },
        },
      });

      test("keeps the way back on a tonal top app bar", async ({ page }) => {
        await page.goto(`/series/${SERIES_ID}`);
        await expect(page.getByRole("alert")).toBeVisible();

        await expect(page.locator("header")).toHaveCSS(
          "background-color",
          TONAL_BAR,
        );
        await expect(
          page.getByRole("link", { name: "Back to the library" }),
        ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      });
    });

    test.describe("when its books have gone", () => {
      test.use({
        backend: {
          ...new FakeShelf([], {
            related: [{ ...OTHER_SERIES, reason: { ...OTHER_SERIES.reason } }],
          }).backend(),
        },
      });

      test("shows no other series below the empty card", async ({ page }) => {
        await page.goto(`/series/${SERIES_ID}`);
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: "No books in this series",
          }),
        ).toBeVisible();

        await expect(
          page.getByRole("region", { name: "Also in your library" }),
        ).toHaveCount(0);
      });
    });
  },
);

test.describe(
  "the series states on an Android phone",
  { tag: "@native" },
  () => {
    test.use({ viewport: PIXEL_9_PRO });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's series states");
    });

    test.describe("while the series is read in", () => {
      test.use({
        backend: {
          ...new FakeShelf([READ]).backend(),
          seriesOverview: () => new Promise(() => undefined),
        },
      });

      test("waits under a 64px top app bar, the skeleton a step below it", async ({
        page,
      }) => {
        await openSeries(page);
        const skeleton = page.getByRole("status", {
          name: "Loading the series",
        });
        await expect(skeleton).toBeVisible();

        await expectTopAppBarOverHero(page, skeleton);
      });
    });

    test.describe("a series whose books have gone", () => {
      test.use({ backend: new FakeShelf([]).backend() });

      test("keeps the 64px top app bar over the cover", async ({ page }) => {
        await openSeries(page);
        const cover = page.getByRole("img", { name: /^Cover of / });
        await expect(cover).toBeVisible();

        await expectTopAppBarOverHero(page, cover);
      });

      test("draws the missing cover as the book glyph", async ({ page }) => {
        await openSeries(page);

        await expect(
          page.getByRole("img", { name: /^Cover of / }).locator("[data-icon]"),
        ).toHaveAttribute("data-icon", "book");
      });

      test("stacks Rescan the folder filled over Show the folder outlined, as Material buttons", async ({
        page,
      }) => {
        await openSeries(page);
        const rescan = page.getByRole("button", { name: "Rescan the folder" });
        const show = page.getByRole("button", { name: "Show the folder" });
        await expect(rescan).toBeVisible();

        const [filled, outlined] = await Promise.all([
          boxOf(rescan),
          boxOf(show),
        ]);

        expect([filled.height, outlined.height]).toEqual([
          BUTTON_HEIGHT,
          BUTTON_HEIGHT,
        ]);
        await expect(rescan).toHaveCSS("font-size", BUTTON_TYPE);
        await expect(show).toHaveCSS("font-size", BUTTON_TYPE);
        await expect(rescan).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-button-primary"),
        );
        await expect(show).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
        expect(outlined.y - (filled.y + filled.height)).toBe(EMPTY_STACK_GAP);
        expect(filled.x + filled.width / 2).toBeCloseTo(
          outlined.x + outlined.width / 2,
          0,
        );
      });
    });

    test.describe("when the series can't be read", () => {
      test.use({
        backend: {
          ...new FakeShelf([READ]).backend(),
          seriesOverview: () => {
            throw new CommandFailure({
              code: "internal",
              message: "the catalog couldn't be read",
            });
          },
        },
      });

      test("offers Try again as an outlined Material button", async ({
        page,
      }) => {
        await openSeries(page);
        const tryAgain = page.getByRole("button", { name: "Try again" });

        await expect(tryAgain).toHaveCSS("font-size", BUTTON_TYPE);
        expect((await boxOf(tryAgain)).height).toBe(BUTTON_HEIGHT);
        await expect(tryAgain).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-button-outline"),
        );
      });

      test("sets the message 24px in from the screen's edges", async ({
        page,
      }) => {
        await openSeries(page);
        const message = page.getByRole("alert").getByRole("heading");

        const box = await boxOf(message);

        expect(box.x).toBe(EMPTY_INSET);
        expect(box.x + box.width).toBe(PIXEL_9_PRO.width - EMPTY_INSET);
      });
    });
  },
);
