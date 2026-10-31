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

    test("sets each category as a 16px row with its checkbox at the end and no rule between rows", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const title = sheet.getByText("Reading", { exact: true });
      const box = sheet.getByRole("checkbox", { name: "Reading" });

      const sheetBox = await boxOf(sheet);
      const boxBox = await boxOf(box);

      await expect(title).toHaveCSS("font-size", "16px");
      await expect(title).toHaveCSS("line-height", "24px");
      expect((await boxOf(title)).x - sheetBox.x).toBeCloseTo(16, 0);
      expect(
        sheetBox.x + sheetBox.width - (boxBox.x + boxBox.width),
      ).toBeLessThanOrEqual(32);
      expect(boxBox.x).toBeGreaterThan(sheetBox.x + sheetBox.width / 2);
      await expect(box.locator("xpath=../..")).toHaveCSS(
        "border-top-width",
        "0px",
      );
    });

    test("draws the New category and Add a tag fields as 56px outlined boxes with a 4px corner, 16px in from the edge", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      const sheetBox = await boxOf(sheet);

      for (const name of ["New category", "Add a tag"]) {
        const field = sheet.getByRole("textbox", { name });
        const group = field.locator("xpath=..");
        const box = await boxOf(group);

        expect(box.height).toBeCloseTo(56, 0);
        expect(box.x - sheetBox.x).toBeCloseTo(16, 0);
        await expect(group).toHaveCSS("border-top-left-radius", "4px");
        await expect(group).toHaveCSS(
          "border-top-color",
          await tokenColour(page, "--native-color-button-outline-edge"),
        );
      }
    });

    test("draws each tag as a 32px chip with an 8px corner, the one on every series filled with the soft accent", async ({
      page,
    }) => {
      const sheet = await openLabels(page);
      const sea = sheet
        .getByRole("listitem")
        .filter({ hasText: "Sea" })
        .first();

      expect((await boxOf(sea)).height).toBeCloseTo(32, 0);
      await expect(sea).toHaveCSS("border-top-left-radius", "8px");
      await expect(sea).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-accent-soft"),
      );
      expect(
        (
          await boxOf(
            sea.getByRole("button", { name: "Remove Sea" }).locator("svg"),
          )
        ).width,
      ).toBeCloseTo(18, 0);
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
