import type { Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(9);
const CENTRE_TOLERANCE_PX = 2;

test.describe("selecting series on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.skip(({ hasTouch }) => !hasTouch, "an iPad has a touch screen");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      ...onPlatform("ios").backend,
      seriesLabels: () => ({
        keepsLabels: true,
        categories: [],
        tags: [],
        suggestedTags: [],
      }),
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  });

  async function startSelecting(page: Page): Promise<void> {
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(LIBRARY.length);
    await page.getByRole("button", { name: "More for the library" }).click();
    await page.getByRole("menuitem", { name: "Select series" }).click();
    await page
      .getByRole("list", { name: "Series" })
      .getByRole("checkbox")
      .first()
      .click();
    await expect(page.getByText("1 selected").first()).toBeVisible();
  }

  test("centres Categories, Tags and Mark as read in capsules at the bottom, keeping the tab bar", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
    await startSelecting(page);

    const group = page.getByRole("group", { name: "Selected series" });
    const names = ["Categories", "Tags", "Mark as read", "Delete"];
    const boxes = await Promise.all(
      names.map(async (name) =>
        boxOf(group.getByRole("button", { name, exact: true })),
      ),
    );
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    expect(
      Math.abs((left + right) / 2 - viewportOf(page).width / 2),
    ).toBeLessThan(CENTRE_TOLERANCE_PX);
    for (const box of boxes) {
      expect(box.height).toBeCloseTo(48, 0);
    }
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });
});
