import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
});

test("draws Sort and filter and View options as icon buttons without words", async ({
  page,
}) => {
  for (const name of ["Sort and filter", "View options"]) {
    const button = page.getByRole("button", { name, exact: true });

    await expect(button).toHaveText("");
    const box = await boxOf(button);
    expect(box.width).toBeCloseTo(box.height, 0);
  }
});

test("sets the search field at the trailing end, after the two buttons", async ({
  page,
}) => {
  const filter = await boxOf(
    page.getByRole("button", { name: "Sort and filter", exact: true }),
  );
  const view = await boxOf(
    page.getByRole("button", { name: "View options", exact: true }),
  );
  const search = await boxOf(page.getByPlaceholder("Search the library"));

  expect(filter.x).toBeLessThan(view.x);
  expect(view.x).toBeLessThan(search.x);
});
