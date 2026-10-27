import type { Page } from "@playwright/test";

import { EXPANDED_MIN_WIDTH, expect, test, viewportOf } from "./fixtures.ts";
import {
  chapters,
  SectionShelf,
  type ShelvedBook,
  volumes,
} from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const SUMMER_SHORT: ShelvedBook = { kind: "special", title: "Summer Short" };
const EVERY_KIND = [...volumes(1, 2), ...chapters(13, 14), SUMMER_SHORT];

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function kinds(page: Page) {
  return page.getByRole("tablist", { name: "Kinds of book" });
}

test.describe("a series with volumes, chapters and specials", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({ backend: shelf.backend() });

  test("shows a tab for each kind of book, volumes first", async ({ page }) => {
    test.skip(!isWide(page), "narrower windows keep one list");

    await openSeries(page);

    const tabs = kinds(page).getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveAccessibleName("Volumes, 2 books");
    await expect(tabs.nth(1)).toHaveAccessibleName("Chapters, 2 books");
    await expect(tabs.nth(2)).toHaveAccessibleName("Specials, 1 book");
    await expect(
      kinds(page).getByRole("tab", { name: "Volumes" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("counts each kind's books beside its name", async ({ page }) => {
    test.skip(!isWide(page), "narrower windows keep one list");

    await openSeries(page);

    await expect(kinds(page).getByRole("tab")).toHaveText([
      "Volumes 2",
      "Chapters 2",
      "Specials 1",
    ]);
  });

  test("lists only the chapters once Chapters is chosen", async ({ page }) => {
    test.skip(!isWide(page), "narrower windows keep one list");
    await openSeries(page);

    await kinds(page).getByRole("tab", { name: "Chapters" }).click();

    const books = page.getByRole("table", { name: "Books" });
    await expect(books.getByRole("link")).toHaveText([
      /chapter 13/,
      /chapter 14/,
    ]);
  });

  test("keeps the counted tabs inside the books column in a longer language at the narrowest wide window", async ({
    page,
  }) => {
    test.skip(!isWide(page), "narrower windows keep one list");
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    await page.setViewportSize({
      width: EXPANDED_MIN_WIDTH,
      height: viewportOf(page).height,
    });

    await openSeries(page);
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab")).toHaveCount(3);

    const edges = await tabs.evaluate((list) => ({
      list: list.getBoundingClientRect().right,
      row: list.parentElement?.getBoundingClientRect().right,
      page: document.documentElement.scrollWidth,
      window: window.innerWidth,
    }));
    expect(edges.list).toBeLessThanOrEqual(edges.row ?? 0);
    expect(edges.page).toBe(edges.window);
  });

  test("keeps every book in one list without tabs on a narrower window", async ({
    page,
  }) => {
    test.skip(isWide(page), "wide linux windows show tabs");

    await openSeries(page);

    await expect(
      page.getByRole("list", { name: "Books" }).getByRole("listitem").first(),
    ).toBeVisible();
    await expect(kinds(page)).toHaveCount(0);
    expect(shelf.listings.at(-1)).toEqual({ section: undefined });
  });
});

test.describe("a series of chapters only", () => {
  const shelf = new SectionShelf(chapters(1, 2, 3));
  test.use({ backend: shelf.backend() });

  test("shows no tabs and keeps the books list", async ({ page }) => {
    await openSeries(page);

    await expect(page.getByText("chapter 03")).toBeVisible();
    await expect(kinds(page)).toHaveCount(0);
  });
});
