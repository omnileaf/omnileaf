import type { Locator, Page } from "@playwright/test";

import { sampleSeriesId } from "../../src/lib/sample-library/sample-library.ts";
import { boxOf, expect, test } from "./fixtures.ts";
import { sampleLibraryOn } from "./screens.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const PHONE = { width: 412, height: 700 };
const LIBRARY_DOWN = 1200;
const SETTINGS_DOWN = 300;
const TABLET_LIBRARY_DOWN = 300;
const TABLET = { width: 820, height: 1180 };
const SERIES_DOWN = 250;
const SLACK_PX = 2;
const VOLUMES_SERIES = sampleSeriesId(21);
const VOLUME_COUNT = 30;
const CHAPTER_COUNT = 120;
const READ_DELAY_MS = 400;

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

async function expectScrolledTo(page: Page, top: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await scrollTopOf(page)) - top))
    .toBeLessThanOrEqual(SLACK_PX);
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
    test.use({ backend: sampleLibraryOn("android") });

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

      await expect(page).toHaveURL(/\/series\//);
      await expectScrolledTo(page, 0);
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
          await new Promise((answered) => setTimeout(answered, READ_DELAY_MS));
          return shelved.seriesBooks(...asked);
        },
      },
    });

    test.beforeEach(({ platform }) => {
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

      await tapWhereItIs(page.getByRole("tab", { name: /^Chapters/ }));

      await expect(
        page.getByRole("tab", { name: /^Chapters/ }),
      ).toHaveAttribute("aria-selected", "true");
      await expectScrolledTo(page, before);
    });
  },
);
