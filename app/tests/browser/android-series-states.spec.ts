import { CommandFailure } from "./fake-backend.ts";
import { expect, test } from "./fixtures.ts";
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
