import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { boxOf, expect, setTextScale, test, tokenColour } from "./fixtures.ts";
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
const ERROR_LIFT = 64;
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

      test("keeps More in the top app bar, unavailable until the series is read in", async ({
        page,
      }) => {
        await openSeries(page);
        const more = topAppBar(page).getByRole("button", { name: "More" });
        await expect(
          page.getByRole("status", { name: "Loading the series" }),
        ).toBeVisible();

        await expect(more).toBeDisabled();
        const [bar, button] = await Promise.all([
          boxOf(topAppBar(page)),
          boxOf(more),
        ]);
        expect(button.y + button.height / 2).toBe(STATUS_BAR + TOP_APP_BAR / 2);
        expect(button.x + button.width).toBeLessThanOrEqual(bar.width);
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

      test("spaces the icon, the message, the note and Try again 16px apart, centred a little above the middle", async ({
        page,
      }) => {
        await openSeries(page);
        const alert = page.getByRole("alert");
        await expect(alert).toBeVisible();

        const [icon, heading, note, button, bar, navigation] =
          await Promise.all([
            boxOf(alert.locator("svg").first()),
            boxOf(alert.getByRole("heading")),
            boxOf(alert.getByText("Nothing in your library has changed.")),
            boxOf(alert.getByRole("button", { name: "Try again" })),
            boxOf(topAppBar(page)),
            boxOf(page.getByRole("navigation", { name: "Main" })),
          ]);

        expect([
          heading.y - (icon.y + icon.height),
          note.y - (heading.y + heading.height),
          button.y - (note.y + note.height),
        ]).toEqual([EMPTY_STACK_GAP, EMPTY_STACK_GAP, EMPTY_STACK_GAP]);
        expect((icon.y + button.y + button.height) / 2).toBe(
          (bar.y + bar.height + navigation.y - ERROR_LIFT) / 2,
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

test.describe(
  "showing a series' folder on an Android phone",
  { tag: "@native" },
  () => {
    let shown: string[] = [];
    let fails = false;

    function showing(books: readonly { state: "read" }[]): FakeBackend {
      return {
        ...new FakeShelf(books).backend(),
        showSeriesInFolder: (series) => {
          if (fails) {
            throw new CommandFailure({
              code: "fileManagerUnavailable",
              message: "no file manager",
            });
          }
          shown = [...shown, series];
          return null;
        },
      };
    }

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's folder");
      shown = [];
      fails = false;
    });

    test.describe("with books", () => {
      test.use({ backend: showing([READ]) });

      test("shows the folder from the series' More", async ({ page }) => {
        await openSeries(page);

        await topAppBar(page)
          .getByRole("button", { name: /^More for / })
          .click();
        await page.getByRole("menuitem", { name: "Show the folder" }).click();

        await expect.poll(() => shown).toEqual([SERIES_ID]);
      });

      test("says so when the folder can't be opened", async ({ page }) => {
        fails = true;
        await openSeries(page);

        await topAppBar(page)
          .getByRole("button", { name: /^More for / })
          .click();
        await page.getByRole("menuitem", { name: "Show the folder" }).click();

        await expect(page.getByText("Couldn't open the folder.")).toBeVisible();
      });
    });

    test.describe("without books", () => {
      test.use({ backend: showing([]) });

      test("shows the folder from Show the folder", async ({ page }) => {
        await openSeries(page);

        await page.getByRole("button", { name: "Show the folder" }).click();

        await expect.poll(() => shown).toEqual([SERIES_ID]);
      });
    });
  },
);

const LONG_TITLE_BOOKS = 90;
const LONG_TITLE_EVERY = 3;
const LARGER_TEXT = 1.3;
const WRAPPED_TITLES = '[data-slot="item-title"] { white-space: normal; }';
const SCROLL_STEP = 20;
const FRAMES_SCROLLED = 30;
const FRAMES_TO_SETTLE = 3;

function longTitledShelf(): FakeShelf {
  const shelf = new FakeShelf(
    Array.from({ length: LONG_TITLE_BOOKS }, () => READ),
  );
  for (let index = 0; index < LONG_TITLE_BOOKS; index += LONG_TITLE_EVERY) {
    shelf.retitle(
      index,
      `The Long Road Home Across the Northern Sea, Part ${String(index + 1)}`,
    );
  }
  return shelf;
}

async function openWithTwoLineTitles(page: Page): Promise<Locator> {
  await setTextScale(page, LARGER_TEXT);
  await page.addInitScript((wrapped) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = wrapped;
      document.head.append(style);
    });
  }, WRAPPED_TITLES);
  await openSeries(page);
  const list = page.getByRole("list", { name: "Books" });
  await expect(list.getByRole("listitem").first()).toBeVisible();
  return list;
}

async function scrollToEnd(page: Page): Promise<void> {
  await page.getByRole("main").evaluate(async (main, frames) => {
    const settled = async () => {
      for (let frame = 0; frame < frames; frame += 1) {
        await new Promise(requestAnimationFrame);
      }
    };
    let height: number;
    do {
      height = main.scrollHeight;
      main.scrollTo({ top: height });
      await settled();
    } while (main.scrollHeight !== height);
  }, FRAMES_TO_SETTLE);
}

test.describe(
  "a long series with two-line titles at larger text on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = longTitledShelf();

    test.use({ backend: shelf.backend() });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's book list");
    });

    test("ends the book list at the bottom of its last row", async ({
      page,
    }) => {
      const list = await openWithTwoLineTitles(page);

      await scrollToEnd(page);

      const last = list.getByRole("listitem").last();
      await expect(last).toContainText(shelf.titleOf(LONG_TITLE_BOOKS - 1));
      await expect(last).toBeInViewport({ ratio: 1 });
      const [row, frame] = await Promise.all([
        boxOf(last),
        boxOf(list.locator("..")),
      ]);
      expect(row.y + row.height).toBeCloseTo(frame.y + frame.height, 1);
    });

    test("keeps each row in place on every frame while scrolling back up from the end", async ({
      page,
    }) => {
      const list = await openWithTwoLineTitles(page);
      await scrollToEnd(page);

      const moves = await list.evaluate(
        async (ul, { step, frames }) => {
          const main = ul.closest("main");
          const row = [...ul.children].find(
            (item) =>
              item.getBoundingClientRect().top >=
              (main?.getBoundingClientRect().top ?? 0),
          );
          const tops = [row?.getBoundingClientRect().top ?? 0];
          for (let frame = 0; frame < frames; frame += 1) {
            main?.scrollBy({ top: -step });
            await new Promise(requestAnimationFrame);
            tops.push(row?.getBoundingClientRect().top ?? 0);
          }
          return tops.slice(1).map((top, index) => top - (tops[index] ?? 0));
        },
        { step: SCROLL_STEP, frames: FRAMES_SCROLLED },
      );

      expect(moves.map((move) => Math.round(move))).toEqual(
        Array.from({ length: FRAMES_SCROLLED }, () => SCROLL_STEP),
      );
    });
  },
);
