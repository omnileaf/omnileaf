import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);

testOnlyInItsWebview("windows");
test.use({
  platform: "windows",
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test("fades a tooltip in over Windows' shortest fade, 83ms linear", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await page.getByRole("button", { name: "View options", exact: true }).hover();
  const tooltip = page.locator("[data-tooltip-content]");
  await expect(tooltip).toBeAttached();

  await expect(tooltip).toHaveCSS("transition-duration", "0.083s");
  await expect(tooltip).toHaveCSS("transition-timing-function", "linear");
});
