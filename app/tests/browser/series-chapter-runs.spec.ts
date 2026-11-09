import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, test } from "./fixtures.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const CHAPTER_COUNT = 30;
const LONG_PRESS_MS = 500;
const SCROLL_STEP_PX = 300;
const EVERY_CHAPTER = chapters(
  ...Array.from({ length: CHAPTER_COUNT }, (_, index) => index + 1),
);
const ANDROID_PHONE = {
  platform: "android",
  viewport: { width: 360, height: 800 },
} as const;
const TURNS = [
  {
    viewport: { width: 700, height: 360 },
    sort: "Sort: In order",
    first: "chapter 01",
  },
  {
    viewport: ANDROID_PHONE.viewport,
    sort: "Sort: Last first",
    first: "chapter 30",
  },
] as const;
const UNNUMBERED_CHAPTER = "Sample Series 04 Extra.cbz";
const SECOND_SERIES = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  cover: null,
  bookCount: CHAPTER_COUNT,
  readCount: 0,
  isAdult: false,
} as const;
const IPHONE = {
  platform: "ios",
  viewport: { width: 390, height: 844 },
} as const;

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

function sort(page: Page): Locator {
  return page.getByRole("button", { name: /^Sort/ });
}

function findBook(page: Page): Locator {
  return page.getByRole("button", { name: "Find a book" });
}

function searchField(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Find a book" });
}

function showChoices(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Show" });
}

function bookList(page: Page): Locator {
  return page.getByRole("list", { name: "Books" });
}

function bookLinks(page: Page): Locator {
  return bookList(page).getByRole("link");
}

function runHeadings(page: Page): Locator {
  return bookList(page).getByRole("heading", { level: 3 });
}

async function scrollBy(page: Page, top: number): Promise<boolean> {
  return page.getByRole("main").evaluate((main, by) => {
    const before = main.scrollTop;
    main.scrollBy({ top: by });
    return main.scrollTop > before;
  }, top);
}

async function drawnRowHeights(page: Page): Promise<number[]> {
  return bookList(page)
    .locator(":scope > li")
    .evaluateAll((rows) =>
      rows.map((row) => Math.round(row.getBoundingClientRect().height)),
    );
}

async function hold(page: Page, target: Locator): Promise<void> {
  const touch = { pointerType: "touch", isPrimary: true };
  await target.dispatchEvent("pointerdown", touch);
  await page.clock.runFor(LONG_PRESS_MS);
  await target.dispatchEvent("pointerup", touch);
}

test.describe(
  "a series of chapters only on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      ...ANDROID_PHONE,
      backend: new SectionShelf(EVERY_CHAPTER).backend(),
    });

    test("lists the newest chapter first", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: Last first");
      await expect(bookLinks(page).first()).toContainText("chapter 30");
    });

    test("keeps In order once it is chosen, across a change of Show", async ({
      page,
    }) => {
      await openSeries(page);

      await sort(page).click();
      await page.getByRole("menuitemradio", { name: "In order" }).click();
      await showChoices(page).getByRole("radio", { name: "Unread" }).click();

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
      await expect(bookLinks(page).first()).toContainText("chapter 01");
    });

    test("lists the rows in the order Sort names as the phone turns past the compact width and back", async ({
      page,
    }) => {
      await openSeries(page);

      for (const turn of TURNS) {
        await page.setViewportSize(turn.viewport);
        await bookList(page).scrollIntoViewIfNeeded();

        await expect(sort(page)).toHaveAccessibleName(turn.sort);
        await expect(bookLinks(page).first()).toContainText(turn.first);
      }
    });

    test("heads the newest run of twelve chapters above its rows", async ({
      page,
    }) => {
      await openSeries(page);

      await expect(runHeadings(page).first()).toHaveText("Chapters 25–30");
      const [heading, newest] = await Promise.all([
        runHeadings(page).first().boundingBox(),
        bookLinks(page).first().boundingBox(),
      ]);
      expect(heading?.y).toBeLessThan(newest?.y ?? 0);
    });

    test("scrolls through every run with the headings and rows kept even", async ({
      page,
    }) => {
      await openSeries(page);
      const seen = new Set<string>();
      const heights = new Set<number>();

      do {
        await expect(bookLinks(page).first()).toBeVisible();
        for (const text of await runHeadings(page).allTextContents()) {
          seen.add(text.trim());
        }
        for (const height of await drawnRowHeights(page)) {
          heights.add(height);
        }
      } while (await scrollBy(page, SCROLL_STEP_PX));

      await expect(bookLinks(page).last()).toContainText("chapter 01");
      expect([...seen]).toEqual([
        "Chapters 25–30",
        "Chapters 13–24",
        "Chapters 1–12",
      ]);
      expect(heights.size).toBe(1);
    });

    test("keeps the run headings while picking chapters", async ({ page }) => {
      await page.clock.install();
      await openSeries(page);

      await hold(page, bookList(page).getByText("chapter 30"));

      await expect(
        bookList(page).getByRole("checkbox", { checked: true }),
      ).toHaveCount(1);
      await expect(runHeadings(page).first()).toHaveText("Chapters 25–30");
    });

  },
);

test.describe(
  "two series of chapters only on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = new SectionShelf(EVERY_CHAPTER).backend();
    test.use({
      ...ANDROID_PHONE,
      backend: {
        ...shelf,
        seriesOverview: async (id) => {
          const first = await shelf.seriesOverview(SERIES_ID);
          return id === SECOND_SERIES.id
            ? { ...first, id: SECOND_SERIES.id, title: SECOND_SERIES.title }
            : {
                ...first,
                related: [{ ...SECOND_SERIES, reason: { kind: "sameWriter" } }],
              };
        },
        seriesBooks: (_id, listing, after) =>
          shelf.seriesBooks(SERIES_ID, listing, after),
      },
    });

    test("lists the next series newest first after In order was chosen in the first", async ({
      page,
    }) => {
      await openSeries(page);
      await sort(page).click();
      await page.getByRole("menuitemradio", { name: "In order" }).click();
      await expect(sort(page)).toHaveAccessibleName("Sort: In order");

      await page
        .getByRole("link", { name: new RegExp(SECOND_SERIES.title) })
        .click();

      await expect(
        page.getByRole("heading", { level: 1, name: SECOND_SERIES.title }),
      ).toBeVisible();
      await expect(sort(page)).toHaveAccessibleName("Sort: Last first");
    });
  },
);

test.describe(
  "a series of volumes only on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      ...ANDROID_PHONE,
      backend: new SectionShelf(volumes(1, 2, 3)).backend(),
    });

    test("lists the volumes in order", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
    });
  },
);

test.describe(
  "a series of chapters only on an iPhone",
  { tag: "@native" },
  () => {
    test.use({ ...IPHONE, backend: new SectionShelf(EVERY_CHAPTER).backend() });

    test("lists the chapters in order", async ({ page }) => {
      await openSeries(page);

      await expect(sort(page)).toHaveAccessibleName("Sort: In order");
      await expect(bookLinks(page).first()).toContainText("chapter 01");
      await expect(runHeadings(page)).toHaveCount(0);
    });

  },
);
