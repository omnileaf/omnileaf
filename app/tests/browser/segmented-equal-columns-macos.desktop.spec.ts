import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";
import { openViewOptions } from "./view-options.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);
const SUBPIXEL = 0.5;
const ADULT_NOTE = "Adult age rating, or marked by hand.";
const LABEL_TRACKING = "-0.08px";
const shelf = new FakeShelf(
  Array.from({ length: 4 }, () => ({ state: "notStarted" }) as const),
);

test.use({
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => ({
      formats: ["comic"],
      languages: [],
      tags: [],
      ratesAdult: true,
      keepsBookmarks: true,
      smart: [],
    }),
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
  },
});

async function widthsOf(group: Locator): Promise<readonly number[]> {
  const widths: number[] = [];
  for (const segment of await group.getByRole("radio").all()) {
    widths.push((await boxOf(segment)).width);
  }
  return widths;
}

async function expectEqualWidths(group: Locator): Promise<void> {
  const widths = await widthsOf(group);
  expect(widths.length).toBeGreaterThan(1);
  for (const width of widths) {
    expect(Math.abs(width - (widths[0] ?? 0))).toBeLessThanOrEqual(SUBPIXEL);
  }
}

async function openInspector(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await page
    .getByRole("button", { name: "Sort and filter", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Sort and filter",
  });
  await expect(inspector).toBeVisible();
  await settle(inspector);
  return inspector;
}

test.describe("a segmented control on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  for (const name of ["18+", "Bookmarked"]) {
    test(`gives the ${name} filter in the inspector equal columns across the panel`, async ({
      page,
    }) => {
      const inspector = await openInspector(page);
      const group = inspector.getByRole("radiogroup", { name, exact: true });

      await expectEqualWidths(group);
      const panelWidth = (
        await boxOf(inspector.getByText(ADULT_NOTE, { exact: true }))
      ).width;
      expect(Math.abs((await boxOf(group)).width - panelWidth)).toBeLessThan(
        SUBPIXEL,
      );
    });
  }

  test("tracks the inspector's labels and notes at -0.08px", async ({
    page,
  }) => {
    const inspector = await openInspector(page);

    await expect(inspector.getByText("18+", { exact: true })).toHaveCSS(
      "letter-spacing",
      LABEL_TRACKING,
    );
    await expect(inspector.getByText(ADULT_NOTE, { exact: true })).toHaveCSS(
      "letter-spacing",
      LABEL_TRACKING,
    );
  });

  for (const name of ["Display", "Covers per row", "Group by"]) {
    test(`gives ${name} in the view options equal columns`, async ({
      page,
    }) => {
      await page.goto("/");
      const options = await openViewOptions(page);

      await expectEqualWidths(options.getByRole("radiogroup", { name }));
    });
  }

  test("gives the Show choices on a series equal columns", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const show = page.getByRole("radiogroup", { name: "Show" });
    await show.scrollIntoViewIfNeeded();
    await expect(show).toBeVisible();

    await expectEqualWidths(show);
  });
});

for (const platform of ["windows", "linux"] as const satisfies Platform[]) {
  test.describe(`a segmented control on ${platform}`, () => {
    test.use({ platform });

    test("keeps Group by segments as wide as their words", async ({ page }) => {
      await page.goto("/");
      const options = await openViewOptions(page);

      const widths = await widthsOf(
        options.getByRole("radiogroup", { name: "Group by" }),
      );

      expect(new Set(widths.map(Math.round)).size).toBeGreaterThan(1);
    });
  });
}
