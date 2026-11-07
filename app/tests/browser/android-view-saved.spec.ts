import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, onPlatform, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const WRITER = "Sample Writer";

function savedAsCreatorGroups(base: FakeBackend): FakeBackend {
  return {
    ...base,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryWriters: () => ({
      writers: [{ name: WRITER, seriesCount: LIBRARY.length }],
      next: null,
    }),
    writerSeriesCount: () => LIBRARY.length,
    writerSeries: (_writer, after, listing) =>
      pagedSeries(() => LIBRARY)(after, listing),
    libraryView: () => ({
      ...DEFAULT_LIBRARY_VIEW,
      display: "covers",
      groupBy: "creator",
    }),
  };
}

test.describe(
  "a library saved with Covers and Creator on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      backend: savedAsCreatorGroups(onPlatform("android").backend),
    });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's phone options");
    });

    test("draws the series ungrouped, as None would", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
      await expect(
        page.getByRole("region", { name: WRITER, exact: true }),
      ).toHaveCount(0);
    });
  },
);

test.describe("a library saved with Covers and Creator on Windows", () => {
  test.use({
    backend: savedAsCreatorGroups({
      ...DEFAULT_BACKEND,
      ...onPlatform("windows").backend,
    }),
  });

  test.beforeEach(({ platform }) => {
    test.skip(platform !== undefined, "the desktop window");
  });

  test("keeps grouping the series by creator", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("region", { name: WRITER, exact: true }),
    ).toBeVisible();
  });
});
