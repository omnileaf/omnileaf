import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  SeriesLabels,
} from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(6);
const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
] as LibraryCategory[];

function labelsFor(series: readonly string[]): SeriesLabels {
  return {
    keepsLabels: true,
    categories: [
      { category: CATEGORIES[0] as LibraryCategory, holding: series.length },
      { category: CATEGORIES[1] as LibraryCategory, holding: 0 },
    ],
    tags: [{ tag: "Sea", holding: series.length }],
    suggestedTags: ["Letters"],
  };
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: (series) => labelsFor(series),
  },
});

async function openLabels(page: Page): Promise<Locator> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem")).toHaveCount(LIBRARY.length);
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await list
    .getByRole("listitem")
    .nth(1)
    .getByRole("link")
    .first()
    .dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = list.getByRole("checkbox", { name: LIBRARY[1]?.title ?? "" });
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name: "Categories" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Categories and tags" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

test.describe(
  "the categories and tags sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material sheet");
    });

    test("sets the title at title large with no badge, and what it does under it at 14px", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const title = sheet.getByRole("heading", { name: "Categories and tags" });
      const note = sheet.getByText("For 1 series", { exact: false });

      await expect(title).toHaveCSS("font-size", "22px");
      await expect(title).toHaveCSS("line-height", "28px");
      await expect(title).toHaveCSS("font-weight", "400");
      expect((await boxOf(title)).x - (await boxOf(sheet)).x).toBeCloseTo(
        16,
        0,
      );
      await expect(note).toHaveCSS("font-size", "14px");
    });

    test("heads Categories and Tags in the green accent", async ({ page }) => {
      const sheet = await openLabels(page);

      for (const name of ["Categories", "Tags"]) {
        const heading = sheet.getByRole("heading", { name, exact: true });
        await expect(heading).toHaveCSS("font-size", "14px");
        await expect(heading).toHaveCSS("font-weight", "500");
        await expect(heading).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-button-plain"),
        );
      }
    });

    test("ends the sheet with one full-width Done button 56px tall, 16px from the foot", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const sheetBox = await boxOf(sheet);
      const done = await boxOf(sheet.getByRole("button", { name: "Done" }));

      expect(done.height).toBeCloseTo(56, 0);
      expect(done.x - sheetBox.x).toBeCloseTo(16, 0);
      expect(done.width).toBeCloseTo(sheetBox.width - 32, 0);
      expect(sheetBox.y + sheetBox.height - (done.y + done.height)).toBeCloseTo(
        16,
        0,
      );
    });
  },
);
