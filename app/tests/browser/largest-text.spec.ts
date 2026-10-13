import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import {
  COVERS_PER_ROW,
  type CoversPerRow,
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
} from "../../src/lib/ipc/bindings.ts";
import { type FakeBackend, fakeProtocolRoute } from "./fake-backend.ts";
import {
  APP_PAGES,
  expect,
  onPlatform,
  LARGEST_TEXT_SCALE,
  NOTHING_READ_THIS_WEEK,
  setTextScale,
  sidewaysOverflow,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const PAGES = [
  ...APP_PAGES,
  "/settings/privacy",
  "/settings/privacy/screenshot-mode",
] as const;
const PLATFORMS = ["ios", "android"] as const;
const GLYPH_OVERSHOOT = 4;
const IPAD_LANDSCAPE = { width: 1180, height: 820 };
const DISPLAYS: readonly LibraryDisplay[] = [
  "grid",
  "compact",
  "covers",
  "list",
];
const SERIES_IN_LIBRARY = 60;
const LIBRARY_WIDTHS = [390, 744, 840, 1024, 1200, 1280, 1440];
const LIBRARY_HEIGHT = 900;
const SWEEPING_SCREEN = "-tablet";
const LANGUAGES = ["en", "en-XA"] as const;
const COVERS_PER_ROW_CHOICES = {
  "the default covers per row": DEFAULT_LIBRARY_VIEW.coversPerRow,
  "the most covers per row": {
    phone: COVERS_PER_ROW.phone.most,
    tablet: COVERS_PER_ROW.tablet.most,
    desktop: COVERS_PER_ROW.desktop.most,
  },
  "the most covers per row that still show book counts": {
    phone: 3,
    tablet: 8,
    desktop: 8,
  },
} as const satisfies Record<string, CoversPerRow>;
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;
const FIRST_LAUNCH_STEPS = ["welcome", "home", "link", "choices", "ready"];
const IPAD_PRO_LANDSCAPE = { width: 1376, height: 1032 };
const TOUCH_TARGET_PX = 48;
const MESSAGES = { en: english, "en-XA": pseudo } as const;
const READ_AT_MS = Date.parse("2026-10-05T19:05:00.000Z");
const DAY_MS = 86_400_000;

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

function historyEntry(
  number: number,
  reading: WireEntry["reading"],
): WireEntry {
  return {
    book: `0190a3e4-0000-8000-8000-00000000000${String(number)}`,
    bookTitle: `Sample Series 0${String(number)} v0${String(number)}`,
    series: `0190a3e4-0000-8000-8001-00000000000${String(number)}`,
    seriesTitle: `Sample Series 0${String(number)}`,
    position: number,
    cover: null,
    startedAtMs: READ_AT_MS - number * 60_000,
    utcOffsetMinutes: 0,
    readSeconds: 600,
    readTo:
      reading.state === "read"
        ? { state: "end" }
        : { state: "page", page: 14, pageCount: 30 },
    reading,
    day: { day: Math.floor(READ_AT_MS / DAY_MS), readSeconds: 1200 },
  };
}

const READ_ENTRIES = [
  historyEntry(1, { state: "started", page: 14 }),
  historyEntry(2, { state: "read" }),
];

function linkFits(page: Page): Promise<{ spills: boolean; height: number }[]> {
  return page
    .getByRole("main")
    .getByRole("link")
    .filter({ visible: true })
    .evaluateAll((links) =>
      links.map((link) => ({
        spills:
          link.scrollWidth > link.clientWidth ||
          link.scrollHeight > link.clientHeight,
        height: link.getBoundingClientRect().height,
      })),
    );
}

function headingSpill(page: Page): Promise<number> {
  return page
    .locator("main header")
    .first()
    .evaluate((heading) => heading.scrollWidth - heading.clientWidth);
}

function textSpillingDown(page: Page): Promise<string[]> {
  return page.evaluate((overshoot) => {
    const spilled: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const style = getComputedStyle(element);
      if (
        element.clientWidth === 0 ||
        element.closest("[aria-hidden=true], [inert]") !== null ||
        style.textOverflow === "ellipsis" ||
        style.clipPath !== "none" ||
        style.webkitLineClamp !== "none"
      ) {
        continue;
      }
      const hasText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      const isScroller = ["auto", "scroll"].includes(style.overflowY);
      if (
        hasText &&
        !isScroller &&
        element.scrollHeight - element.clientHeight > overshoot
      ) {
        spilled.push(element.outerHTML.slice(0, 140));
      }
    }
    return spilled;
  }, GLYPH_OVERSHOOT);
}

test.skip(
  ({ isMobile }) => !isMobile,
  "the system text size reaches phones and tablets",
);

for (const platform of PLATFORMS) {
  test.describe(`with the largest text on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test.beforeEach(async ({ page }) => {
      await setTextScale(page, LARGEST_TEXT_SCALE);
    });

    async function expectNothingSpills(page: Page, where = ""): Promise<void> {
      expect(await sidewaysOverflow(page, "body"), where).toEqual([]);
      expect(await textSpillingDown(page), where).toEqual([]);
    }

    for (const path of PAGES) {
      test(`fits ${path} without spilling`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        await expectNothingSpills(page);
      });

      test(`fits ${path} without spilling in an iPad's landscape window`, async ({
        page,
      }) => {
        await page.setViewportSize(IPAD_LANDSCAPE);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        await expectNothingSpills(page);
      });
    }

    for (const display of DISPLAYS) {
      for (const [choice, coversPerRow] of Object.entries(
        COVERS_PER_ROW_CHOICES,
      )) {
        for (const language of LANGUAGES) {
          test.describe(`with series shown as ${display} at ${choice} in ${language}`, () => {
            test.use({
              backend: {
                ...onPlatform(platform).backend,
                librarySeries: pagedSeries(() =>
                  sampleSeries(SERIES_IN_LIBRARY).map((series, index) => ({
                    ...series,
                    cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
                  })),
                ),
                librarySeriesCount: () => SERIES_IN_LIBRARY,
                libraryView: () => ({
                  ...DEFAULT_LIBRARY_VIEW,
                  display,
                  coversPerRow,
                }),
              },
            });

            test("fits the library without spilling at every width", async ({
              page,
            }, testInfo) => {
              test.skip(
                !testInfo.project.name.endsWith(SWEEPING_SCREEN),
                "each engine sweeps every width once, from a tablet",
              );
              await page.addInitScript((chosen) => {
                localStorage.setItem("omnileaf.language", chosen);
              }, language);
              await page.route(fakeProtocolRoute("omni"), (route) =>
                route.fulfill({
                  contentType: "image/svg+xml",
                  body: COVER_IMAGE,
                }),
              );
              await page.goto("/");
              await expect(
                page.getByText("Sample Series 0001").first(),
              ).toBeVisible();

              for (const width of LIBRARY_WIDTHS) {
                await page.setViewportSize({ width, height: LIBRARY_HEIGHT });

                await expectNothingSpills(page, `at ${String(width)}px`);
                expect(await headingSpill(page), `at ${String(width)}px`).toBe(
                  0,
                );
              }
            });
          });
        }
      }
    }

    test.describe("on a series' page", () => {
      const shelf = new FakeShelf([
        { state: "read" },
        { state: "started", page: 15 },
        { state: "notStarted" },
      ]);

      test.use({
        backend: {
          ...onPlatform(platform).backend,
          seriesOverview: (id) => shelf.backend().seriesOverview(id),
          seriesBooks: (id, listing, after) =>
            shelf.backend().seriesBooks(id, listing, after),
        },
      });

      for (const isPicking of [false, true]) {
        test(`fits a series' page without spilling${isPicking ? " while picking books" : ""}`, async ({
          page,
        }) => {
          await page.goto(`/series/${SERIES_ID}`);
          await expect(
            page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
          ).toBeVisible();
          if (isPicking) {
            const firstBook = page.getByRole("checkbox", {
              name: `Select ${shelf.titleOf(0)}`,
            });
            const more = page.getByRole("button", {
              name: `More for ${shelf.titleOf(0)}`,
            });
            await expect(firstBook.or(more).first()).toBeVisible();
            if (await firstBook.isVisible()) {
              await firstBook.check();
            } else {
              await more.click();
              await page
                .getByRole("dialog")
                .getByRole("button", { name: "Select", exact: true })
                .click();
            }
          }

          await expectNothingSpills(page);
        });
      }
    });

    test.describe("in History with books read", () => {
      test.use({
        backend: {
          ...onPlatform(platform).backend,
          readingHistory: () => ({ entries: READ_ENTRIES, next: null }),
          readingWeek: () => ({ ...NOTHING_READ_THIS_WEEK, readSeconds: 1200 }),
        },
      });

      for (const [language, messages] of Object.entries(MESSAGES)) {
        test(`fits each session's link to its text and a finger in an iPad's widest landscape window in ${language}`, async ({
          page,
        }) => {
          await page.addInitScript((chosen) => {
            window.localStorage.setItem("omnileaf.language", chosen);
          }, language);
          await page.setViewportSize(IPAD_PRO_LANDSCAPE);
          await page.goto("/history");
          await expect(
            page.getByRole("heading", {
              level: 1,
              name: messages.history_title,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("main").getByRole("link").filter({ visible: true }),
          ).toHaveCount(READ_ENTRIES.length);
          await page.evaluate(() => document.fonts.ready);

          const fits = await linkFits(page);

          expect(fits.map(({ spills }) => spills)).toEqual(
            READ_ENTRIES.map(() => false),
          );
          for (const { height } of fits) {
            expect(height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
          }
          await expectNothingSpills(page);
        });
      }
    });

    test.describe("on first launch", () => {
      test.use({
        backend: {
          ...onPlatform(platform).backend,
          firstLaunchFinished: () => false,
        },
      });

      for (const [index, step] of FIRST_LAUNCH_STEPS.entries()) {
        test(`fits the ${step} step without spilling`, async ({ page }) => {
          await page.goto("/first-launch");
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          for (let left = 0; left < index; left += 1) {
            await page
              .getByRole("main")
              .getByRole("button", { name: /^(Get started|Continue)$/ })
              .click();
            await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
          }

          await expectNothingSpills(page);
        });
      }
    });
  });
}
