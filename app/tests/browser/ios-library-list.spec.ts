import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4).map((series, index) => ({
  ...series,
  bookCount: 6,
  unreadCount: index === 0 ? 3 : 0,
  language: index < 2 ? "ja" : null,
  hasDownloads: index === 0,
}));
const VIEW: LibraryView = {
  ...DEFAULT_LIBRARY_VIEW,
  display: "list",
  onCovers: {
    ...DEFAULT_LIBRARY_VIEW.onCovers,
    showsLanguage: true,
    showsDownloaded: true,
    showsUnreadCount: true,
  },
};

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryView: () => VIEW,
  },
});

test.describe("the library as a list on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's plain list");
    await page.goto("/");
    await expect(page.locator("[data-series-id]")).toHaveCount(LIBRARY.length);
  });

  test("sets books, language, the downloaded mark and unread on one subtitle line", async ({
    page,
  }) => {
    const row = page.locator("[data-series-id]").first();

    const subtitle = row.locator("[data-slot='item-subtitle']");

    await expect(subtitle).toHaveText(/^6 books · JA ·\s+· 3 unread$/);
    await expect(subtitle.locator("[data-icon='download']")).toHaveCount(1);
  });

  test("sets the unread count as green text and draws no pill or progress bar", async ({
    page,
  }) => {
    const row = page.locator("[data-series-id]").first();

    await expect(row.getByText("3 unread")).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    await expect(row.locator("[data-slot='badge']")).toHaveCount(0);
    await expect(row.getByRole("progressbar")).toHaveCount(0);
  });

  test("draws each cover 48 by 72 and a one-line row 92 high", async ({
    page,
  }) => {
    const row = page.locator("[data-series-id]").first();
    const cover = row.locator("[data-slot='list-cover']");

    const coverBox = await cover.boundingBox();
    const rowBox = await row.boundingBox();

    expect(coverBox).toMatchObject({ width: 48, height: 72 });
    expect(rowBox?.height).toBe(92);
  });

  test("leaves out what a series has none of", async ({ page }) => {
    const row = page.locator("[data-series-id]").nth(3);

    await expect(row.locator("[data-slot='item-subtitle']")).toHaveText(
      "6 books",
    );
  });
});
