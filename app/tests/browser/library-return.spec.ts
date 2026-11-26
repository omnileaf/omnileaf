import { setTimeout as delay } from "node:timers/promises";

import type { CDPSession, Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { SKELETON_DELAY_MS } from "../../src/lib/library/skeleton-delay.svelte.ts";
import {
  commandsAsked,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import { expect, test } from "./fixtures.ts";
import {
  answeringLikeAPhone,
  describeFrames,
  type LibraryFrame,
  framesOnceShown,
  framesUntilAtRest,
  libraryFrameNow,
  recordLibraryFramesFromTheStart,
  slowTheCpu,
  startRecordingFrames,
  touch,
  watchLibraryFrames,
} from "./library-frames.ts";
import { sampleSeriesId } from "../../src/lib/sample-library/sample-library.ts";
import { sampleLibraryOn } from "./screens.ts";
import {
  pagedSeries,
  sampleSeries,
  SERIES_PER_PAGE,
} from "./series-catalog.ts";

const PHONE = { width: 412, height: 915 };
const LIBRARY_DOWN = 700;
const SLACK_PX = 2;
const POPSTATE_LAG_MS = 20;
const SERIES_ANSWER_HELD_MS = 600;
const LONG_LIBRARY = 300;
const LATER = { id: "later", name: "Later" } as const;
const ADDED_TITLE = "Sample Series 00";

type ComeBack = (page: Page, session: CDPSession) => Promise<void>;

function main(page: Page): Locator {
  return page.getByRole("main");
}

function navigationLink(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name, exact: true });
}

async function libraryAtRest(page: Page): Promise<void> {
  await expect(
    main(page)
      .locator("a[href^='/series/'], [data-slot='empty-title']")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect.poll(async () => (await commandsAsked(page)).unanswered).toBe(0);
}

async function scrollLibraryDown(page: Page): Promise<void> {
  await expect
    .poll(() =>
      main(page).evaluate((scroller, top) => {
        scroller.scrollTo({ top });
        return scroller.scrollTop;
      }, LIBRARY_DOWN),
    )
    .toBeGreaterThanOrEqual(LIBRARY_DOWN - SLACK_PX);
}

async function leaveFor(page: Page, section: string): Promise<void> {
  await navigationLink(page, section).click();
  await expect(
    page.getByRole("heading", { level: 1, name: section }),
  ).toBeVisible();
}

interface OpenedSeries {
  readonly href: string;
  readonly top: number;
}

function seriesInView(page: Page): Promise<OpenedSeries | undefined> {
  return main(page).evaluate((scroller) => {
    const shown = scroller.getBoundingClientRect();
    const link = [
      ...scroller.querySelectorAll<HTMLAnchorElement>("a[href^='/series/']"),
    ].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return (
        candidate.closest("[inert]") === null &&
        box.top > shown.top + shown.height / 3 &&
        box.bottom < shown.bottom
      );
    });
    const href = link?.getAttribute("href");
    const top = link?.getBoundingClientRect().top;
    return href === undefined || href === null || top === undefined
      ? undefined
      : { href, top };
  });
}

async function openSeriesInView(page: Page): Promise<OpenedSeries> {
  await expect
    .poll(() => seriesInView(page), { message: "no series in view" })
    .toBeDefined();
  const opened = await seriesInView(page);
  if (opened === undefined) {
    throw new Error("no series in view");
  }
  await main(page)
    .locator(`a[href='${opened.href}']:not([inert] a)`)
    .first()
    .evaluate((link) => {
      if (link instanceof HTMLElement) {
        link.click();
      }
    });
  await expect(page).toHaveURL(opened.href);
  return opened;
}

function cardTop(page: Page, href: string): Promise<number> {
  return main(page)
    .locator(`a[href='${href}']:not([inert] a)`)
    .first()
    .evaluate((card) => card.getBoundingClientRect().top);
}

async function tapLibrary(page: Page, session: CDPSession): Promise<void> {
  await touch(session, navigationLink(page, "Library"));
}

async function tapBack(page: Page, session: CDPSession): Promise<void> {
  await touch(session, page.getByRole("link", { name: "Back to the library" }));
}

async function goBackInHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    history.back();
  });
}

async function framesComingBack(
  page: Page,
  comeBack: ComeBack,
): Promise<LibraryFrame[]> {
  const session = await slowTheCpu(page);
  await startRecordingFrames(page);
  await comeBack(page, session);
  return framesOnceShown(await framesUntilAtRest(page));
}

function differences(
  frame: LibraryFrame,
  left: LibraryFrame,
): readonly string[] {
  return [
    frame.skeletonTiles > 0 ? "a skeleton" : undefined,
    frame.hasTabs === left.hasTabs ? undefined : "tabs changed",
    frame.chosenTab === left.chosenTab ? undefined : "another tab",
    frame.count === left.count ? undefined : "another count",
    frame.emptyTitle === left.emptyTitle ? undefined : "another empty state",
    frame.firstCover === left.firstCover ? undefined : "another first cover",
    frame.covers > 0 === left.covers > 0 ? undefined : "covers changed",
    frame.sections > 0 === left.sections > 0 ? undefined : "no sections",
    Math.abs(frame.scrollTop - left.scrollTop) <= SLACK_PX
      ? undefined
      : "another scroll place",
  ].filter((difference) => difference !== undefined);
}

function expectEveryFrameAsLeft(
  frames: readonly LibraryFrame[],
  left: LibraryFrame,
): void {
  expect(frames.length, "the Library never showed").toBeGreaterThan(0);
  const first = frames.findIndex(
    (frame) => differences(frame, left).length > 0,
  );
  const shown = frames[first];
  expect(
    shown === undefined ? [] : differences(shown, left),
    `frame ${String(first)} differs from the Library as it was left:\n${JSON.stringify(left)}\n${describeFrames(frames)}`,
  ).toEqual([]);
}

async function leftAndCameBack(
  page: Page,
  leave: (page: Page) => Promise<void>,
  comeBack: ComeBack,
): Promise<{ left: LibraryFrame; frames: LibraryFrame[] }> {
  await libraryAtRest(page);
  const left = await libraryFrameNow(page);
  await leave(page);
  const frames = await framesComingBack(page, comeBack);
  return { left, frames };
}

function withView(
  backend: FakeBackend,
  view: Partial<LibraryView>,
): FakeBackend {
  return {
    ...backend,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, ...view }),
  };
}

function withEmptyCategory(backend: FakeBackend): FakeBackend {
  return {
    ...backend,
    libraryCategories: async () => [
      ...(await backend.libraryCategories()),
      LATER,
    ],
    categorySeries: (category, ...asked) =>
      category === LATER.id
        ? { series: [], next: null }
        : backend.categorySeries(category, ...asked),
    categorySeriesCount: (category, ...asked) =>
      category === LATER.id
        ? 0
        : backend.categorySeriesCount(category, ...asked),
  };
}

let seriesAdded = false;

function withSeriesAddedOnceAsked(backend: FakeBackend): FakeBackend {
  const added = sampleSeries(1).map((series) => ({
    ...series,
    title: ADDED_TITLE,
  }));
  return {
    ...backend,
    librarySeries: async (after, ...asked) => {
      const listed = await backend.librarySeries(after, ...asked);
      return seriesAdded && after === null
        ? { ...listed, series: [...added, ...listed.series] }
        : listed;
    },
    librarySeriesCount: async (...asked) =>
      (await backend.librarySeriesCount(...asked)) + Number(seriesAdded),
  };
}

const SAMPLE = sampleLibraryOn("android");
const ADULT_SERIES = [13, 17];

declare global {
  interface Window {
    __omnileafAdultShown?: Set<string>;
  }
}

test.describe(
  "coming back to the Library on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ browserName, page }) => {
      test.skip(browserName !== "chromium", "frames under a slowed CPU");
      seriesAdded = false;
      await page.setViewportSize(PHONE);
      await watchLibraryFrames(page);
    });

    test.describe("with the sample library", () => {
      test.use({
        backend: answeringLikeAPhone(
          withEmptyCategory(withSeriesAddedOnceAsked(SAMPLE)),
        ),
      });

      for (const section of ["History", "Settings"]) {
        test(`draws every frame from ${section} as the Library was left`, async ({
          page,
        }) => {
          await page.goto("/");

          const { left, frames } = await leftAndCameBack(
            page,
            (shown) => leaveFor(shown, section),
            tapLibrary,
          );

          expectEveryFrameAsLeft(frames, left);
        });
      }

      for (const { way, comeBack } of [
        { way: "the Back button", comeBack: tapBack },
        { way: "a history back", comeBack: goBackInHistory },
      ]) {
        test(`draws every frame from a series opened in a scrolled Library as it was left, coming back by ${way}`, async ({
          page,
        }) => {
          await page.goto("/");
          await libraryAtRest(page);
          await scrollLibraryDown(page);

          const { left, frames } = await leftAndCameBack(
            page,
            async (shown) => {
              await openSeriesInView(shown);
            },
            comeBack,
          );

          expectEveryFrameAsLeft(frames, left);
        });
      }

      test("draws every frame as left when the tab tap goes back in history a moment later", async ({
        page,
      }) => {
        await page.addInitScript((lagMs) => {
          const go = history.go.bind(history);
          history.go = (steps) => {
            setTimeout(() => {
              go(steps);
            }, lagMs);
          };
        }, POPSTATE_LAG_MS);
        await page.goto("/");
        await libraryAtRest(page);
        await scrollLibraryDown(page);

        const { left, frames } = await leftAndCameBack(
          page,
          (shown) => leaveFor(shown, "History"),
          tapLibrary,
        );

        expectEveryFrameAsLeft(frames, left);
      });

      for (const tab of ["Manga", LATER.name]) {
        test(`draws every frame as left on the ${tab} tab`, async ({
          page,
        }) => {
          await page.goto("/");
          await libraryAtRest(page);
          await page.getByRole("tab", { name: tab }).click();
          await expect(
            page.getByRole("tab", { name: tab, selected: true }),
          ).toBeVisible();

          const { left, frames } = await leftAndCameBack(
            page,
            (shown) => leaveFor(shown, "History"),
            tapLibrary,
          );

          expectEveryFrameAsLeft(frames, left);
        });
      }

      test("draws no blank frame and no hidden tab after hiding the chosen tab in Settings", async ({
        page,
      }) => {
        await page.goto("/");
        await libraryAtRest(page);
        await page.getByRole("tab", { name: LATER.name }).click();
        await expect(
          page.getByRole("tab", { name: LATER.name, selected: true }),
        ).toBeVisible();
        await leaveFor(page, "Settings");
        await main(page)
          .getByRole("link", { name: /^Library/ })
          .click();
        await main(page)
          .getByRole("link", { name: /^Library tabs/ })
          .click();
        await page
          .getByRole("button", { name: `More for ${LATER.name}` })
          .click();
        await page.getByRole("menuitem", { name: "Hide this tab" }).click();
        await expect
          .poll(async () => (await commandsAsked(page)).unanswered)
          .toBe(0);

        const frames = await framesComingBack(page, tapLibrary);

        expect(
          frames.filter(
            (frame) =>
              frame.chosenTab === LATER.name ||
              (frame.skeletonTiles === 0 &&
                frame.covers === 0 &&
                frame.emptyTitle === undefined),
          ),
          describeFrames(frames),
        ).toEqual([]);
      });

      test("keeps the count on screen while counting again after a library change", async ({
        page,
      }) => {
        await page.goto("/");
        await libraryAtRest(page);
        const left = await libraryFrameNow(page);
        await slowTheCpu(page);
        await startRecordingFrames(page);

        await emitFakeEvent(page, "library-changed");

        const frames = await framesUntilAtRest(page);
        expect(
          frames.filter((frame) => frame.count !== left.count),
          describeFrames(frames),
        ).toEqual([]);
      });

      test("shows a series added while away once the Library has read itself again, holding the opened series in place", async ({
        page,
      }) => {
        await page.goto("/");
        await libraryAtRest(page);
        await scrollLibraryDown(page);
        const left = await libraryFrameNow(page);
        const opened = await openSeriesInView(page);
        seriesAdded = true;

        const frames = await framesComingBack(page, goBackInHistory);

        expect(
          frames.filter((frame) => frame.skeletonTiles > 0),
          describeFrames(frames),
        ).toEqual([]);
        expect(frames.at(0)?.count).toBe(left.count);
        expect(frames.at(-1)?.count).not.toBe(left.count);
        await expect
          .poll(async () =>
            Math.abs((await cardTop(page, opened.href)) - opened.top),
          )
          .toBeLessThanOrEqual(SLACK_PX);
      });
    });

    test.describe("after hiding 18+ series in Settings", () => {
      test.use({ backend: answeringLikeAPhone(SAMPLE) });

      test("draws none of the hidden series in any frame", async ({ page }) => {
        const adult = ADULT_SERIES.map(
          (number) => `/series/${sampleSeriesId(number)}`,
        );
        await page.goto("/");
        await libraryAtRest(page);
        await expect(
          main(page)
            .locator(`a[href='${adult[0] ?? ""}']`)
            .first(),
        ).toBeAttached();
        await leaveFor(page, "Settings");
        await main(page)
          .getByRole("link", { name: /^Library/ })
          .click();
        await main(page)
          .getByRole("link", { name: /^18\+ content/ })
          .click();
        await main(page).getByText("Hide", { exact: true }).click();
        await expect
          .poll(async () => (await commandsAsked(page)).unanswered)
          .toBe(0);
        await page.evaluate((hidden) => {
          const shown = new Set<string>();
          window.__omnileafAdultShown = shown;
          const look = (): void => {
            if (location.pathname === "/") {
              for (const href of hidden) {
                if (document.querySelector(`main a[href='${href}']`) !== null) {
                  shown.add(href);
                }
              }
            }
            requestAnimationFrame(look);
          };
          requestAnimationFrame(look);
        }, adult);

        await tapLibrary(page, await slowTheCpu(page));
        await libraryAtRest(page);

        expect(
          await page.evaluate(() => [...(window.__omnileafAdultShown ?? [])]),
        ).toEqual([]);
      });
    });

    for (const { name, view } of [
      { name: "grouped by creator", view: { groupBy: "creator" } },
      { name: "grouped by category", view: { groupBy: "category" } },
      { name: "drawn as a list", view: { display: "list" } },
      {
        name: "with the Continue reading row",
        view: { showsContinueRow: true },
      },
    ] as const) {
      test.describe(`with the Library ${name}`, () => {
        test.use({
          backend: answeringLikeAPhone(withView(SAMPLE, view)),
        });

        test("draws every frame from History as it was left", async ({
          page,
        }) => {
          await page.goto("/");

          const { left, frames } = await leftAndCameBack(
            page,
            (shown) => leaveFor(shown, "History"),
            tapLibrary,
          );

          expectEveryFrameAsLeft(frames, left);
        });
      });
    }

    test.describe("with the Library filtered", () => {
      test.use({
        backend: answeringLikeAPhone({
          ...SAMPLE,
          libraryListing: async () => {
            const listing = await SAMPLE.libraryListing();
            return {
              ...listing,
              filter: { ...listing.filter, unread: "only" },
            };
          },
        }),
      });

      test("draws every frame from History as it was left", async ({
        page,
      }) => {
        await page.goto("/");

        const { left, frames } = await leftAndCameBack(
          page,
          (shown) => leaveFor(shown, "History"),
          tapLibrary,
        );

        expectEveryFrameAsLeft(frames, left);
      });
    });
  },
);

let seriesPagesAsked: (string | null)[] = [];

test.describe(
  "coming back to a long Library on an Android phone",
  { tag: "@native" },
  () => {
    const catalog = sampleSeries(LONG_LIBRARY);
    const listed = pagedSeries(() => catalog);

    test.use({
      backend: answeringLikeAPhone({
        ...SAMPLE,
        librarySeries: (after, chosen) => {
          seriesPagesAsked.push(after);
          return listed(after, chosen);
        },
        librarySeriesCount: () => LONG_LIBRARY,
      }),
    });

    test.beforeEach(async ({ browserName, page }) => {
      test.skip(browserName !== "chromium", "frames under a slowed CPU");
      seriesPagesAsked = [];
      await page.setViewportSize(PHONE);
      await watchLibraryFrames(page);
    });

    test("keeps only the page it showed last, drawing it at once and reading just that page again", async ({
      page,
    }) => {
      await page.goto("/");
      await libraryAtRest(page);
      await expect
        .poll(() =>
          main(page).evaluate((scroller) => {
            scroller.scrollTo({ top: scroller.scrollHeight });
            return scroller.querySelector("li[aria-posinset='300']") !== null;
          }),
        )
        .toBe(true);
      await main(page).evaluate((scroller) => {
        scroller.scrollTo({ top: 0 });
      });
      await libraryAtRest(page);
      const everyPage = seriesPagesAsked.length;

      const { left, frames } = await leftAndCameBack(
        page,
        async (shown) => {
          await leaveFor(shown, "History");
          seriesPagesAsked = [];
        },
        tapLibrary,
      );

      expect(everyPage).toBe(LONG_LIBRARY / SERIES_PER_PAGE);
      expectEveryFrameAsLeft(frames, left);
      expect(seriesPagesAsked).toEqual([null]);
    });
  },
);

test.describe(
  "opening the Library for the first time",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(PHONE);
      await recordLibraryFramesFromTheStart(page);
    });

    test.describe("when the library answers at once", () => {
      test.use({ backend: SAMPLE });

      test("draws no skeleton", async ({ page }) => {
        await page.goto("/");

        const frames = framesOnceShown(await framesUntilAtRest(page));

        expect(
          frames.filter((frame) => frame.skeletonTiles > 0),
          describeFrames(frames),
        ).toEqual([]);
      });
    });

    test.describe("when the library's series take a while", () => {
      test.use({
        backend: {
          ...SAMPLE,
          librarySeries: async (...asked) => {
            await delay(SERIES_ANSWER_HELD_MS);
            return SAMPLE.librarySeries(...asked);
          },
        },
      });

      test("shows the skeleton only once the delay has passed, and goes from it straight to the covers", async ({
        page,
      }) => {
        await page.goto("/");

        const recorded = await framesUntilAtRest(page);

        const frames = framesOnceShown(recorded);
        const mountedAfter = recorded[recorded.length - frames.length - 1]?.at;
        const skeletonFrom = frames.findIndex(
          (frame) => frame.skeletonTiles > 0,
        );
        const skeletonAt = frames[skeletonFrom]?.at;
        expect(skeletonAt, describeFrames(frames)).toBeGreaterThanOrEqual(
          (mountedAfter ?? 0) + SKELETON_DELAY_MS,
        );
        expect(
          frames
            .slice(skeletonFrom)
            .filter(
              (frame) =>
                frame.skeletonTiles === 0 &&
                frame.covers === 0 &&
                frame.emptyTitle === undefined,
            ),
          describeFrames(frames),
        ).toEqual([]);
      });
    });
  },
);

for (const { platform, isPhone } of [
  { platform: "ios", isPhone: true },
  { platform: "linux", isPhone: false },
] as const) {
  test.describe(
    `coming back to the Library on ${platform}`,
    { tag: "@native" },
    () => {
      test.use({ backend: answeringLikeAPhone(sampleLibraryOn(platform)) });

      test.beforeEach(async ({ browserName, isMobile, page }) => {
        test.skip(
          isPhone ? browserName !== "webkit" || !isMobile : isMobile,
          `${platform}'s own engine and screen`,
        );
        await watchLibraryFrames(page);
      });

      test("draws every frame from History as the Library was left", async ({
        page,
      }) => {
        await page.goto("/");
        await libraryAtRest(page);
        const left = await libraryFrameNow(page);
        await leaveFor(page, "History");

        await startRecordingFrames(page);
        await navigationLink(page, "Library").click();
        const frames = framesOnceShown(await framesUntilAtRest(page));

        expectEveryFrameAsLeft(frames, left);
      });
    },
  );
}
