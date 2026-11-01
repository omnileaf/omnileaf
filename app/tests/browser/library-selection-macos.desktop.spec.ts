import type { Locator, Page } from "@playwright/test";

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
const TOOLBAR_BOTTOM_PX = 120;

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

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

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function group(page: Page): Locator {
  return page.getByRole("group", { name: "Selected series" });
}

async function pickTwo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
  await covers(page)
    .getByRole("listitem")
    .nth(0)
    .getByRole("link")
    .first()
    .click({ modifiers: ["Meta"] });
  await covers(page).getByRole("checkbox").nth(1).click();
}

test("keeps the Library heading and says how many of the series are selected", async ({
  page,
}) => {
  await pickTwo(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(page.getByText("2 of 12 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select all/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Cancel selecting" }),
  ).toHaveCount(0);
});

test("puts Categories, Tags, Mark as read and Delete in the toolbar, not at the bottom", async ({
  page,
}) => {
  await pickTwo(page);

  await expect(group(page)).toHaveCount(1);
  for (const name of ["Categories", "Tags", "Mark as read", "Delete"]) {
    const button = group(page).getByRole("button", { name });
    await expect(button).toBeVisible();
    expect((await boxOf(button)).y).toBeLessThan(TOOLBAR_BOTTOM_PX);
  }
});

test("clears the selection with Escape", async ({ page }) => {
  await pickTwo(page);

  await page.keyboard.press("Escape");

  await expect(group(page)).toHaveCount(0);
  await expect(page.getByText("2 of 12 selected")).toHaveCount(0);
});

test("clears the selection with a click on empty space", async ({ page }) => {
  await pickTwo(page);

  await page.mouse.click(WINDOW.width - 4, WINDOW.height - 4);

  await expect(group(page)).toHaveCount(0);
});

test("draws no check circle on the covers, keeping the picked ones checked for assistive tech", async ({
  page,
}) => {
  await pickTwo(page);

  await expect(page.locator('[data-slot="selection-mark"]')).toHaveCount(0);
  await expect(
    covers(page).getByRole("checkbox", { checked: true }),
  ).toHaveCount(2);
});

const HIGHLIGHT_SHARE_OF_COVER_WIDTH = 1 / 16;
const WHOLE_PIXEL_OUTLINE = 1;

function pickedCover(page: Page, index: number): Locator {
  return covers(page).getByRole("checkbox").nth(index).locator("> div").first();
}

function pickedTitle(page: Page, index: number): Locator {
  return covers(page).getByRole("checkbox").nth(index).locator("p").first();
}

async function outlineOf(cover: Locator) {
  return cover.evaluate((element) => {
    const { outlineWidth, outlineStyle, outlineColor, outlineOffset } =
      getComputedStyle(element);
    return {
      width: outlineStyle === "none" ? 0 : parseFloat(outlineWidth),
      style: outlineStyle,
      color: outlineColor,
      offset: parseFloat(outlineOffset),
    };
  });
}

test("sits a picked cover on a grey highlight a sixteenth of its width wide", async ({
  page,
}) => {
  await pickTwo(page);

  const outline = await outlineOf(pickedCover(page, 0));
  const { width } = await boxOf(pickedCover(page, 0));

  expect(outline.style).toBe("solid");
  expect(outline.offset).toBe(0);
  expect(
    Math.abs(outline.width - width * HIGHLIGHT_SHARE_OF_COVER_WIDTH),
  ).toBeLessThan(WHOLE_PIXEL_OUTLINE);
  expect(outline.color).not.toBe("rgba(0, 0, 0, 0)");
});

test("leaves a cover that is not picked without a highlight", async ({
  page,
}) => {
  await pickTwo(page);

  const outline = await outlineOf(pickedCover(page, 2));

  expect(outline.width).toBe(0);
});

test("draws the picked cover's title on an accent pill and the others plain", async ({
  page,
}) => {
  await pickTwo(page);

  const picked = pickedTitle(page, 0);
  const plain = pickedTitle(page, 2);

  await expect(picked).toHaveCSS("background-color", "rgb(47, 111, 79)");
  await expect(picked).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(picked).toHaveCSS("border-radius", "4px");
  await expect(plain).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("lets the highlight go with the selection", async ({ page }) => {
  await pickTwo(page);

  await page.keyboard.press("Escape");

  const outline = await outlineOf(
    covers(page).getByRole("link").nth(0).locator("> div").first(),
  );
  expect(outline.width).toBe(0);
});
