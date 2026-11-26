import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { sampleSeriesId } from "../../src/lib/sample-library/sample-library.ts";
import { boxOf, expect, framesPassed, test } from "./fixtures.ts";
import {
  answerOnceReleased,
  type HeldReads,
  releaseEvery,
} from "./held-reads.ts";
import { sampleLibraryOn } from "./screens.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import { withCountsUnderCovers } from "./view-options.ts";

const PHONE = { width: 412, height: 700 };
const LIBRARY_DOWN = 1200;
const SETTINGS_DOWN = 300;
const TABLET_LIBRARY_DOWN = 200;
const TABLET = { width: 820, height: 1180 };
const SERIES_DOWN = 250;
const SLACK_PX = 2;
const SERIES_PAGE = /\/series\//;
const VOLUMES_SERIES = sampleSeriesId(21);
const CONTINUED_SERIES = sampleSeriesId(11);
const VOLUME_COUNT = 30;
const CHAPTER_COUNT = 120;

const removedSeries = new Set<string>();
let bookReads: HeldReads = { isHolding: false, waiting: [] };

function withoutRemoved<Listed extends { series: readonly { id: string }[] }>(
  listed: Listed,
): Listed {
  return {
    ...listed,
    series: listed.series.filter(
      ({ id }) => !removedSeries.has(`/series/${id}`),
    ),
  };
}

function numbersFrom(first: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => first + index);
}

function main(page: Page): Locator {
  return page.getByRole("main");
}

async function scrollMainTo(page: Page, top: number): Promise<void> {
  await expect
    .poll(() =>
      main(page).evaluate((scroller, to) => {
        scroller.scrollTo({ top: to });
        return scroller.scrollTop;
      }, top),
    )
    .toBeGreaterThanOrEqual(top - SLACK_PX);
}

async function tapWhereItIs(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.click();
    }
  });
}

function scrollTopOf(page: Page): Promise<number> {
  return main(page).evaluate((scroller) => scroller.scrollTop);
}

async function resizeContentOf(page: Page): Promise<void> {
  await main(page).evaluate((scroller) => {
    const content = [...scroller.children].find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.offsetHeight > 0,
    );
    if (content === undefined) {
      throw new Error("the screen has no content with a height");
    }
    content.style.minHeight = `${String(content.offsetHeight + 1)}px`;
  });
  await framesPassed(page);
}

async function expectScrolledTo(page: Page, top: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await scrollTopOf(page)) - top))
    .toBeLessThanOrEqual(SLACK_PX);
}

async function backToLibraryFromSeries(page: Page): Promise<Locator> {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await scrollMainTo(page, LIBRARY_DOWN);
  const opened = await seriesLinkInView(page);
  const card = main(page).locator(`a[href='${opened}']`).first();
  await tapWhereItIs(card);
  await expect(page).toHaveURL(opened);
  await page.goBack();
  await expect(card).toBeInViewport();
  return card;
}

function seriesLinkInView(page: Page): Promise<string> {
  return main(page).evaluate((scroller) => {
    const shown = scroller.getBoundingClientRect();
    const link = [
      ...scroller.querySelectorAll<HTMLAnchorElement>("a[href^='/series/']"),
    ].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return (
        box.top > shown.top + shown.height / 3 && box.bottom < shown.bottom
      );
    });
    if (link === undefined) {
      throw new Error("no series in view");
    }
    return link.getAttribute("href") ?? "";
  });
}

test.describe("going back on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's back");
  });

  test.describe("from a series to the Library", () => {
    const sample = sampleLibraryOn("android");

    test.use({
      backend: {
        ...sample,
        librarySeries: async (...asked) =>
          withoutRemoved(await sample.librarySeries(...asked)),
        categorySeries: async (...asked) =>
          withoutRemoved(await sample.categorySeries(...asked)),
      },
    });

    test.beforeEach(() => {
      removedSeries.clear();
    });

    for (const { way, goBack } of [
      {
        way: "Android's back gesture",
        goBack: (page: Page) => page.goBack(),
      },
      {
        way: "the back button",
        goBack: (page: Page) =>
          page.getByRole("link", { name: "Back to the library" }).click(),
      },
    ]) {
      test(`lands where the Library was, the series in view, with ${way}`, async ({
        page,
      }) => {
        await page.setViewportSize(PHONE);
        await page.goto("/");
        await scrollMainTo(page, LIBRARY_DOWN);
        const opened = await seriesLinkInView(page);
        const card = main(page).locator(`a[href='${opened}']`).first();
        const shownAt = (await boxOf(card)).y;

        await tapWhereItIs(card);
        await expect(page).toHaveURL(opened);
        await goBack(page);

        await expect(page).toHaveURL("/");
        await expect(card).toBeInViewport();
        await expect
          .poll(async () => Math.abs((await boxOf(card)).y - shownAt))
          .toBeLessThanOrEqual(SLACK_PX);
      });
    }

    test("lets go of the Library's place and its scroll anchoring once the app scrolls it elsewhere", async ({
      page,
    }) => {
      await backToLibraryFromSeries(page);
      await expect(main(page)).toHaveCSS("overflow-anchor", "none");

      await main(page).evaluate((scroller) => {
        scroller.scrollTo({ top: 0 });
      });

      await expectScrolledTo(page, 0);
      await resizeContentOf(page);
      expect(await scrollTopOf(page)).toBe(0);
      await expect(main(page)).toHaveCSS("overflow-anchor", "auto");
    });

    test("gives the Library its scroll anchoring back once a finger touches it", async ({
      page,
    }) => {
      await backToLibraryFromSeries(page);

      await main(page).dispatchEvent("pointerdown");

      await expect(main(page)).toHaveCSS("overflow-anchor", "auto");
    });

    test("gives the Library its scroll anchoring back once another page opens", async ({
      page,
    }) => {
      const card = await backToLibraryFromSeries(page);
      await expect(main(page)).toHaveCSS("overflow-anchor", "none");

      await tapWhereItIs(card);

      await expect(page).toHaveURL(SERIES_PAGE);
      await expect(main(page)).toHaveCSS("overflow-anchor", "auto");
    });

    test("lands at the saved scroll position when the series it left is gone on the way back", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/");
      await scrollMainTo(page, LIBRARY_DOWN);
      const before = await scrollTopOf(page);
      const opened = await seriesLinkInView(page);
      await tapWhereItIs(main(page).locator(`a[href='${opened}']`).first());
      await expect(page).toHaveURL(opened);
      removedSeries.add(opened);

      await page.goBack();

      await expect(page).toHaveURL("/");
      await expect(main(page).locator(`a[href='${opened}']`)).toHaveCount(0);
      await expectScrolledTo(page, before);
    });

    test("lands where a series page was after opening a volume and going back", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`/series/${VOLUMES_SERIES}`);
      await scrollMainTo(page, SERIES_DOWN);
      const before = await scrollTopOf(page);

      await tapWhereItIs(
        main(page)
          .getByRole("link", { name: /^Volume 2/ })
          .first(),
      );
      await expect(page).toHaveURL(/\/volume\/2$/);
      await page.goBack();

      await expectScrolledTo(page, before);
    });

    test("lands where the Library was on a tablet after going back", async ({
      page,
    }) => {
      await page.setViewportSize(TABLET);
      await page.goto("/");
      await scrollMainTo(page, TABLET_LIBRARY_DOWN);
      const opened = await seriesLinkInView(page);
      const card = main(page).locator(`a[href='${opened}']`).first();
      const shownAt = (await boxOf(card)).y;

      await tapWhereItIs(card);
      await expect(page).toHaveURL(opened);
      await page.goBack();

      await expect
        .poll(async () => Math.abs((await boxOf(card)).y - shownAt))
        .toBeLessThanOrEqual(SLACK_PX);
    });

    test("opens a page it has not come back to at its top", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/");
      await scrollMainTo(page, LIBRARY_DOWN);

      await main(page).locator("a[href^='/series/']").first().click();

      await expect(page).toHaveURL(SERIES_PAGE);
      await expectScrolledTo(page, 0);
    });

    test.describe("with the counts under the covers on", () => {
      const sampleWithCounts = sampleLibraryOn("android");

      test.use({
        backend: {
          ...sampleWithCounts,
          libraryView: async () =>
            withCountsUnderCovers(await sampleWithCounts.libraryView()),
        },
      });

      test("lands where the Library was, the series in view, with Android's back gesture", async ({
        page,
      }) => {
        await page.setViewportSize(PHONE);
        await page.goto("/");
        await scrollMainTo(page, LIBRARY_DOWN);
        const opened = await seriesLinkInView(page);
        const card = main(page).locator(`a[href='${opened}']`).first();
        const shownAt = (await boxOf(card)).y;

        await tapWhereItIs(card);
        await expect(page).toHaveURL(opened);
        await page.goBack();

        await expect(page).toHaveURL("/");
        await expect(card).toBeInViewport();
        await expect
          .poll(async () => Math.abs((await boxOf(card)).y - shownAt))
          .toBeLessThanOrEqual(SLACK_PX);
      });
    });

    test.describe("with the Continue reading row on", () => {
      test.use({
        backend: {
          ...sampleLibraryOn("android"),
          libraryView: () => ({
            ...DEFAULT_LIBRARY_VIEW,
            showsContinueRow: true,
          }),
        },
      });

      test("lands on the grid card, not the Continue reading one, when both show the series", async ({
        page,
      }) => {
        const opened = `/series/${CONTINUED_SERIES}`;
        await page.setViewportSize(PHONE);
        await page.goto("/");
        await expect(
          page
            .getByRole("region", { name: "Continue reading" })
            .locator(`a[href='${opened}']`),
        ).toBeVisible();
        const card = main(page)
          .locator(`a[href='${opened}']:not(section a)`)
          .first();
        await card.evaluate((element) => {
          element.scrollIntoView({ block: "center" });
        });
        const shownAt = (await boxOf(card)).y;

        await tapWhereItIs(card);
        await expect(page).toHaveURL(opened);
        await page.goBack();

        await expect(page).toHaveURL("/");
        await expect
          .poll(async () => Math.abs((await boxOf(card)).y - shownAt))
          .toBeLessThanOrEqual(SLACK_PX);
      });
    });
  });

  test("lands where the Settings list was after coming back from a page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: PHONE.width, height: 480 });
    await page.goto("/settings");
    await scrollMainTo(page, SETTINGS_DOWN);
    const before = await scrollTopOf(page);

    await tapWhereItIs(page.getByRole("link", { name: /^About/ }));
    await expect(
      page.getByRole("heading", { level: 1, name: "About" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to Settings" }).click();

    await expect(page).toHaveURL("/settings");
    await expectScrolledTo(page, before);
  });
});

test.describe(
  "switching a series' tabs on an Android phone",
  { tag: "@native" },
  () => {
    const shelved = new SectionShelf([
      ...volumes(...numbersFrom(1, VOLUME_COUNT)),
      ...chapters(...numbersFrom(VOLUME_COUNT + 1, CHAPTER_COUNT)),
    ]).backend();

    test.use({
      backend: {
        ...shelved,
        seriesBooks: async (...asked) => {
          await answerOnceReleased(bookReads);
          return shelved.seriesBooks(...asked);
        },
      },
    });

    test.beforeEach(({ platform }) => {
      bookReads = { isHolding: false, waiting: [] };
      test.skip(platform !== "android", "Android's series tabs");
    });

    test("keeps the page where it was when Chapters is chosen", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`/series/${SERIES_ID}`);
      await expect(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      ).toBeVisible();
      await scrollMainTo(page, SERIES_DOWN);
      const before = await scrollTopOf(page);

      bookReads.isHolding = true;

      await tapWhereItIs(page.getByRole("tab", { name: /^Chapters/ }));
      await expect.poll(() => bookReads.waiting.length).toBeGreaterThan(0);
      await framesPassed(page);
      releaseEvery(bookReads);

      await expect(
        page.getByRole("tab", { name: /^Chapters/ }),
      ).toHaveAttribute("aria-selected", "true");
      await expectScrolledTo(page, before);
    });
  },
);
