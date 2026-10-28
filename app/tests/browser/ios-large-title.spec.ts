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
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep the title beside its buttons",
  );
  await page.goto("/");
  const bar = page.locator("[data-title-bar]");
  const title = page.getByRole("heading", { level: 1, name: "Library" });
  const barTitle = bar.getByText("Library", { exact: true });

  const buttons = await boxOf(bar.getByRole("button", { name: "More" }));
  expect((await boxOf(title)).y).toBeGreaterThan(buttons.y + buttons.height);
  await expect(barTitle).toHaveCSS("opacity", "0");
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: 600 });
  });

  await expect(barTitle).toHaveCSS("opacity", "1");
});

test("keeps the title beside its buttons on a wide iPad", async ({ page }) => {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "iPhones set a large title under the buttons",
  );
  await page.goto("/");

  await expect(page.locator("[data-title-bar]")).toHaveCount(0);
});

/** Headless WebKit takes seconds to draw each row of blurred iOS unread badges, long enough to miss the frame a resize waits for on CI. */
const FEW_SERIES = 6;

test.describe("with a few series", () => {
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      librarySeries: pagedSeries(() => sampleSeries(FEW_SERIES)),
      librarySeriesCount: () => FEW_SERIES,
    },
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
});

test("keeps the folded title clear of Search and More, two glass circles 12 apart", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep the title beside its buttons",
  );
  await page.goto("/");
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
  const second = await boxOf(more);

  expect(title.x + title.width).toBeLessThanOrEqual(first.x);
  expect(second.x - (first.x + first.width)).toBeCloseTo(12, 0);
  await expect(search).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(more).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(
    bar.getByRole("button", { name: "Sort and filter" }),
  ).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "View options" })).toHaveCount(
    0,
  );
});

test("opens Sort and filter and View options from More on an iPhone", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep their own buttons",
  );
  await page.goto("/");
  const more = page
    .locator("[data-title-bar]")
    .getByRole("button", { name: "More" });

  await more.click();
  const items = page.getByRole("menuitem");

  await expect(items.nth(0)).toHaveText("Sort and filter");
  await expect(items.nth(1)).toHaveText("View options");
  await items.nth(0).click();
  await expect(
    page.getByRole("dialog", { name: "Sort and filter" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("menuitem", { name: "View options" }).click();
  await expect(
    page.getByRole("dialog", { name: "View options" }),
  ).toBeVisible();
});

test("draws each of History's bar buttons on its own glass circle on an iPhone", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "iPads keep the title beside its buttons",
  );
  await page.goto("/history");
  const buttons = page
    .locator("[data-title-bar]")
    .getByRole("button")
    .or(page.locator("[data-title-bar]").getByRole("link"));
  await expect(buttons.first()).toBeVisible();

  for (const button of await buttons.all()) {
    await expect(button).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const box = await boxOf(button);
    expect(box.width).toBeCloseTo(box.height, 0);
  }
});
