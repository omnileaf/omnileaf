import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  expect,
  EXPANDED_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

test.use({
  backend: {
    ...onPlatform("ios").backend,
    librarySeries: pagedSeries(() => sampleSeries(40)),
    librarySeriesCount: () => 40,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, showsItemCounts: true }),
  },
});

test("sets the library's large title under its buttons on an iPhone, folding it into the bar on scrolling", async ({
  page,
}) => {
  await page.goto("/");
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep the title beside its buttons",
  );
  const bar = page.locator("[data-title-bar]");
  const title = page.getByRole("heading", { level: 1, name: "Library" });
  const barTitle = bar.getByText("Library", { exact: true });

  const buttons = await boxOf(
    bar.getByRole("button", { name: "Sort and filter" }),
  );
  expect((await boxOf(title)).y).toBeGreaterThan(buttons.y + buttons.height);
  await expect(barTitle).toHaveCSS("opacity", "0");
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: 600 });
  });

  await expect(barTitle).toHaveCSS("opacity", "1");
});

test("keeps the title beside its buttons on a wide iPad", async ({ page }) => {
  await page.goto("/");
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "iPhones set a large title under the buttons",
  );

  await expect(page.locator("[data-title-bar]")).toHaveCount(0);
});

test("raises no error when the window narrows from an iPad's width to an iPhone's and back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: EXPANDED_MIN_WIDTH, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator("[data-title-bar]")).toBeVisible();
  await page.setViewportSize({ width: EXPANDED_MIN_WIDTH, height: 900 });
  await expect(page.locator("[data-title-bar]")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("keeps the folded title clear of its buttons, which share one glass capsule", async ({
  page,
}) => {
  await page.goto("/");
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep the title beside its buttons",
  );
  const bar = page.locator("[data-title-bar]");
  const barTitle = bar.getByText("Library", { exact: true });
  const search = bar.getByRole("link", { name: "Search" });
  const more = bar.getByRole("button", { name: "More" });
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: 600 });
  });
  await expect(barTitle).toHaveCSS("opacity", "1");

  const title = await boxOf(barTitle);
  const first = await boxOf(search);
  const capsule = await boxOf(search.locator(".."));

  expect(title.x + title.width).toBeLessThanOrEqual(first.x);
  expect(capsule.width).toBeCloseTo((await boxOf(more)).x + 44 - first.x, 0);
  await expect(search).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(search.locator("..")).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});
