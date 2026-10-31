import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(9);
const CAPSULE_NAMES = ["Categories", "Tags", "Mark as read", "Delete"] as const;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
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

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function capsule(page: Page, name: string): Locator {
  return page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name });
}

async function startSelecting(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  const link = seriesList(page).getByRole("listitem").nth(1).getByRole("link");
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await link.first().dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = seriesList(page).getByRole("checkbox", {
    name: LIBRARY[1]?.title ?? "",
  });
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await expect(page.getByText("1 selected").first()).toBeVisible();
}

test.describe("selecting series on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "iOS's edit mode");
  });

  test("takes the tab bar's place with Categories, Tags and Mark as read, each in its own capsule", async ({
    page,
  }) => {
    await startSelecting(page);

    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    const boxes = await Promise.all(
      CAPSULE_NAMES.map(async (name) => boxOf(capsule(page, name))),
    );
    for (const box of boxes) {
      expect(box.height).toBeCloseTo(48, 0);
      expect(box.width).toBeGreaterThan(box.height);
    }
    for (const name of CAPSULE_NAMES) {
      const isClipped = await capsule(page, name).evaluate(
        (button) => button.scrollWidth > button.clientWidth,
      );
      expect(isClipped, name).toBe(false);
    }
    const [categories, tags, markRead, remove] = boxes;
    expect(categories?.x).toBeLessThan(tags?.x ?? 0);
    expect(tags?.x).toBeLessThan(markRead?.x ?? 0);
    expect((markRead?.x ?? 0) + (markRead?.width ?? 0)).toBeLessThan(
      remove?.x ?? 0,
    );
    expect((remove?.x ?? 0) + (remove?.width ?? 0)).toBeGreaterThan(
      viewportOf(page).width - 24,
    );
  });

  test("sizes Select all and Done to their words, on one line", async ({
    page,
  }) => {
    await startSelecting(page);

    for (const name of ["Select all", "Done"]) {
      const fit = await page
        .getByRole("button", { name })
        .evaluate((button) => {
          const text = document.createRange();
          text.selectNodeContents(button);
          const { left, right } = button.getBoundingClientRect();
          const edges = text.getBoundingClientRect();
          return {
            lines: new Set(
              [...text.getClientRects()].map((line) => Math.round(line.top)),
            ).size,
            fitsInside: edges.left >= left && edges.right <= right,
          };
        });
      expect(fit, name).toEqual({ lines: 1, fitsInside: true });
    }
  });

  test("sets Categories, Tags, Mark as read and Select all in the page's ink, leaving the accent to Done", async ({
    page,
  }) => {
    await startSelecting(page);

    const ink = await page.evaluate(
      () => getComputedStyle(document.body).color,
    );
    for (const name of CAPSULE_NAMES) {
      await expect(capsule(page, name)).toHaveCSS("color", ink);
    }
    await expect(page.getByRole("button", { name: "Select all" })).toHaveCSS(
      "color",
      ink,
    );
    await expect(page.getByRole("button", { name: "Done" })).not.toHaveCSS(
      "color",
      ink,
    );
  });

  test("brings the tab bar back when the selection ends", async ({ page }) => {
    await startSelecting(page);

    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(capsule(page, "Tags")).toBeHidden();
  });
});
