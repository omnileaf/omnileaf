import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  selectByLongPress,
  test,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";
import { SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID } from "./series-shelf.ts";

const LIBRARY = sampleSeries(3);
const TABLET = { width: 820, height: 1180 };
const shelf = new SectionShelf(volumes(1, 2));

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function shownKeyCaps(page: Page): Locator {
  return page.locator("kbd:visible");
}

async function holdFirstOf(page: Page, list: Locator): Promise<void> {
  await expect(list.getByRole("listitem").first()).toBeVisible();
  await selectByLongPress(page, list.getByRole("listitem").first());
  await expect(page.getByText(/1 (selected|book)/u).first()).toBeVisible();
}

test.describe("key caps on Android and iOS", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(
      platform !== "android" && platform !== "ios",
      "no keyboard to hint at",
    );
  });

  test("shows no key cap while a series' covers are picked", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await holdFirstOf(page, page.getByRole("list", { name: "Volumes" }));

    await expect(shownKeyCaps(page)).toHaveCount(0);
  });

  test("shows no key cap while the library's series are picked", async ({
    page,
  }) => {
    await page.goto("/");

    await holdFirstOf(page, page.getByRole("list", { name: "Series" }));

    await expect(shownKeyCaps(page)).toHaveCount(0);
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: TABLET });

    test("shows no key cap while a series' covers are picked", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await holdFirstOf(page, page.getByRole("list", { name: "Volumes" }));

      await expect(shownKeyCaps(page)).toHaveCount(0);
    });
  });
});
