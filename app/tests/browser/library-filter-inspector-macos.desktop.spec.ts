import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);
const INSPECTOR_WIDTH = 280;
const SMALL_BUTTON_HEIGHT = 20;
const LABEL_LINE_HEIGHT = 16;

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function filterButton(page: Page): Locator {
  return page.getByRole("button", { name: "Sort and filter", exact: true });
}

function inspectorOf(page: Page): Locator {
  return page.getByRole("complementary", { name: "Sort and filter" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
});

async function openInspector(page: Page): Promise<Locator> {
  await filterButton(page).click();
  await expect(inspectorOf(page)).toBeVisible();
  await settle(inspectorOf(page));
  return inspectorOf(page);
}

test("opens Sort and filter as a narrow inspector running the window's full height", async ({
  page,
}) => {
  const box = await boxOf(await openInspector(page));

  const { width, height } = viewportOf(page);
  expect(box.width).toBe(INSPECTOR_WIDTH);
  expect(box.x + box.width).toBeCloseTo(width, 0);
  expect(box.y).toBe(0);
  expect(box.height).toBeCloseTo(height, 0);
});

test("narrows the toolbar and the covers to the column beside the inspector", async ({
  page,
}) => {
  const box = await boxOf(await openInspector(page));

  const search = await boxOf(page.getByPlaceholder("Search the library"));
  const covers = await boxOf(page.getByRole("list", { name: "Series" }));
  expect(search.x + search.width).toBeLessThanOrEqual(box.x);
  expect(covers.x + covers.width).toBeLessThanOrEqual(box.x);
});

test("has no close button, since Sort and filter in the toolbar closes it", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  await expect(
    inspector.getByRole("button", { name: "Close sort and filter" }),
  ).toHaveCount(0);
  await filterButton(page).click();
  await expect(inspector).toBeHidden();
});

test("sets its title as plain headline text, without the round badge", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const title = inspector.getByRole("heading", { name: "Sort and filter" });
  const style = await title.evaluate((element) => {
    const drawn = getComputedStyle(element);
    return { size: drawn.fontSize, weight: drawn.fontWeight };
  });
  expect(style).toEqual({ size: "13px", weight: "700" });
  await expect(title.locator("xpath=..").locator("svg")).toHaveCount(0);
});

test("ends in the match count and a small Reset button", async ({ page }) => {
  const inspector = await openInspector(page);

  await expect(inspector.getByRole("status")).toHaveText("12 series match");
  const reset = await boxOf(inspector.getByRole("button", { name: "Reset" }));
  expect(reset.height).toBe(SMALL_BUTTON_HEIGHT);
});

test("stacks Sort by over the sort pop-up and its order button, all inside the inspector", async ({
  page,
}) => {
  const inspector = await openInspector(page);

  const box = await boxOf(inspector);
  const label = await boxOf(inspector.getByText("Sort by", { exact: true }));
  const sort = await boxOf(
    inspector.getByRole("combobox", { name: "Sort by" }),
  );
  const order = await boxOf(
    inspector.getByRole("group", { name: "Sort by" }).getByRole("button"),
  );
  expect(label.height).toBeLessThan(2 * LABEL_LINE_HEIGHT);
  expect(label.y + label.height).toBeLessThanOrEqual(sort.y);
  expect(sort.y).toBe(order.y);
  expect(order.x + order.width).toBeLessThanOrEqual(box.x + box.width);
});

test("chooses the Read state from a pop-up, as System Settings does", async ({
  page,
}) => {
  const inspector = await openInspector(page);
  const readState = inspector.getByRole("combobox", { name: "Read state" });

  await readState.selectOption({ label: "Unread" });

  await expect(readState).toHaveValue("unread");
  await expect(
    inspector.getByRole("group", { name: "Read state" }),
  ).toHaveCount(0);
});

test("sets its section headings in the headline type", async ({ page }) => {
  const inspector = await openInspector(page);

  for (const name of ["Sort", "Filter"]) {
    const heading = inspector.getByRole("heading", { name, exact: true });
    const style = await heading.evaluate((element) => {
      const drawn = getComputedStyle(element);
      return { size: drawn.fontSize, weight: drawn.fontWeight };
    });
    expect(style).toEqual({ size: "13px", weight: "700" });
  }
});

test.describe("on Linux", () => {
  test.use({ platform: "linux" });

  test("keeps the wider panel under the toolbar, with its close button", async ({
    page,
  }) => {
    const panel = await openInspector(page);

    const box = await boxOf(panel);
    expect(box.width).toBe(340);
    expect(box.y).toBeGreaterThan(0);
    await expect(
      panel.getByRole("button", { name: "Close sort and filter" }),
    ).toBeVisible();
  });
});
