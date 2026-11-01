import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(6).map((series, index) => ({
  ...series,
  bookCount: 4 + index,
  unreadCount: index % 3,
  language: "ja",
}));
const VIEW: LibraryView = {
  ...DEFAULT_LIBRARY_VIEW,
  display: "list",
  onCovers: {
    ...DEFAULT_LIBRARY_VIEW.onCovers,
    showsLanguage: true,
    showsUnreadCount: true,
  },
};

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryView: () => VIEW,
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-series-id]")).toHaveCount(LIBRARY.length);
});

test("heads the list with Books, Unread, Language and Progress columns", async ({
  page,
}) => {
  for (const name of ["Books", "Unread", "Language", "Progress"]) {
    await expect(
      page.locator("[data-list-column]").getByText(name, { exact: true }),
    ).toBeVisible();
  }
});

test("lines each series' books, unread count and language up under its column", async ({
  page,
}) => {
  const unread = await boxOf(
    page.locator("[data-list-column]").getByText("Unread", { exact: true }),
  );
  const row = page.locator("[data-series-id]").nth(1);

  const cell = await boxOf(row.locator("[data-list-cell='unread']"));

  expect(Math.abs(cell.x - unread.x)).toBeLessThan(2);
  await expect(row.locator("[data-list-cell='unread']")).toHaveText("1");
  await expect(row.locator("[data-list-cell='books']")).toHaveText("5");
  await expect(row.locator("[data-list-cell='language']")).toHaveText("JA");
});

test("fills every other row in a faint grey", async ({ page }) => {
  const first = page.locator("[data-series-id]").nth(0);
  const second = page.locator("[data-series-id]").nth(1);

  const fills = await Promise.all(
    [first, second].map((row) =>
      row.evaluate((element) => getComputedStyle(element).backgroundColor),
    ),
  );

  expect(fills[0]).not.toBe(fills[1]);
});
