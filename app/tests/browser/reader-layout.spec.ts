import type { Locator, Page } from "@playwright/test";

import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  readerBackend,
  servePages,
} from "./reader-book.ts";

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

const LAYOUT_KEY = "omnileaf.readerSettings.all";

async function openBookWith(page: Page, look: object): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: LAYOUT_KEY, value: JSON.stringify(look) },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function shownPage(page: Page, number: number): Locator {
  return page.getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

function scroller(page: Page): Locator {
  return page.locator("[data-shown-page]");
}

test("keeps the cover alone, then shows pages two at a time", async ({
  page,
}) => {
  await openBookWith(page, { layout: "two" });
  await expect(shownPage(page, 1)).toBeVisible();

  await page.keyboard.press("ArrowRight");

  await expect(shownPage(page, 2)).toBeVisible();
  await expect(shownPage(page, 3)).toBeVisible();
  const left = await boxOf(shownPage(page, 2));
  const right = await boxOf(shownPage(page, 3));
  expect(left.x + left.width).toBeCloseTo(right.x, 0);
  await page.keyboard.press("m");
  await expect(page.getByText(`2–3 / ${String(PAGE_COUNT)}`)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(shownPage(page, 4)).toBeVisible();
  await expect(shownPage(page, 5)).toBeVisible();
});

test("turns the Two pages quick setting on and off", async ({ page }) => {
  await openBookWith(page, {});
  const twoPages = page
    .getByRole("group", { name: "Quick settings" })
    .getByRole("button", { name: "Two pages" });

  await twoPages.click();

  await expect(twoPages).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(shownPage(page, 3)).toBeVisible();
});

test("fits a page to the width and scrolls down it, back to the top on the next", async ({
  page,
}) => {
  await openBookWith(page, { fit: "width" });
  const space = await boxOf(scroller(page));

  const shown = await boxOf(shownPage(page, 1));

  expect(Math.round(shown.width)).toBe(Math.round(space.width));
  test.skip(
    shown.height <= space.height,
    "a page fitted to a narrow screen's width fits its height too",
  );
  await scroller(page).evaluate((element) => {
    element.scrollTo({ top: 200 });
  });
  await page.keyboard.press("ArrowRight");
  await expect(shownPage(page, 2)).toBeVisible();
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollTop))
    .toBe(0);
});

test("fits a page to the height", async ({ page }) => {
  await openBookWith(page, { fit: "height" });
  const space = await boxOf(scroller(page));

  const shown = await boxOf(shownPage(page, 1));

  expect(Math.round(shown.height)).toBe(Math.round(space.height));
});

test("still turns a page fitted to the width with a tap at the edge", async ({
  page,
}) => {
  await openBookWith(page, { fit: "width" });

  await page.getByRole("button", { name: "Next page" }).click();

  await expect(shownPage(page, 2)).toBeVisible();
});
