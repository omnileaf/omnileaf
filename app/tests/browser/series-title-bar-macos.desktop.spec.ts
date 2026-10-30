import type { Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const WINDOW = { width: 1280, height: 800 };
const BACK_SIZE = 24;
const TITLE_TYPE = {
  fontSize: "13px",
  lineHeight: "16px",
  fontWeight: "700",
  letterSpacing: "-0.08px",
};
const STATUS_TYPE = { fontSize: "11px", lineHeight: "13px", fontWeight: "510" };

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

const shelf = new FakeShelf(
  Array.from({ length: 8 }, () => ({ state: "notStarted" }) as const),
);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
  },
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function titleBar(page: Page) {
  return page.locator("[data-page-toolbar]");
}

async function typeOf(page: Page, selector: string) {
  return titleBar(page)
    .locator(selector)
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        lineHeight: `${String(Math.round(Number.parseFloat(style.lineHeight)))}px`,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      };
    });
}

test.describe("a series' title bar on macOS", () => {
  test("goes back to the library from a chevron in place of a breadcrumb", async ({
    page,
  }) => {
    await openSeries(page);
    const back = titleBar(page).getByRole("link", {
      name: "Back to the library",
    });

    const box = await boxOf(back);

    expect([box.width, box.height]).toEqual([BACK_SIZE, BACK_SIZE]);
    await expect(
      titleBar(page).getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveCount(0);
    await back.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("names the series in the title bar's headline type", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(titleBar(page).getByText(SERIES_TITLE)).toBeVisible();
    expect(await typeOf(page, "[data-title-bar-title]")).toEqual(TITLE_TYPE);
  });

  test("counts the picked books under the title while picking", async ({
    page,
  }) => {
    await openSeries(page);
    const status = titleBar(page).getByRole("status");
    await expect(status).toBeEmpty();

    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(0)}` })
      .click();
    await page
      .getByRole("checkbox", { name: `Select ${shelf.titleOf(2)}` })
      .click();

    await expect(status).toHaveText("2 of 8 selected");
    expect(await typeOf(page, "[role=status]")).toMatchObject(STATUS_TYPE);
  });
});
