import {
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";

test.use({
  platform: "ios",
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test("sets a series title under its cover in 13px footnote type at weight 590", async ({
  page,
}) => {
  test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "the phone's covers");
  await page.goto("/");

  const title = page.getByText(FIRST_TITLE, { exact: true });

  await expect(title).toHaveCSS("font-size", "13px");
  await expect(title).toHaveCSS("font-weight", "590");
});
