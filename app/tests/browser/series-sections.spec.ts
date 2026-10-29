import type { Page } from "@playwright/test";

import { emitFakeEvent } from "./fake-backend.ts";
import {
  EXPANDED_MIN_WIDTH,
  expect,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import {
  chapters,
  SectionShelf,
  type ShelvedBook,
  volumes,
} from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const SUMMER_SHORT: ShelvedBook = { kind: "special", title: "Summer Short" };
const EVERY_KIND = [...volumes(1, 2), ...chapters(13, 14), SUMMER_SHORT];
const READ_CHAPTER: ShelvedBook = {
  kind: "chapter",
  numbers: { first: 12, last: 12 },
  reading: { state: "read" },
};
const NARROW_WIDTH = EXPANDED_MIN_WIDTH - 40;
const LIBRARY_CHANGED = "library-changed";

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

function covers(page: Page, section: string) {
  return page.getByRole("list", { name: section }).getByRole("link");
}

function bookRows(page: Page) {
  return page.getByRole("table", { name: "Books" }).getByRole("link");
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

    await expect(page.getByText("chapter 01")).toBeVisible();
    await expect(kinds(page)).toHaveCount(0);
  });
});

test.describe("a series whose chapters come in late", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  const backend = shelf.backend();
  let releaseChapters: () => void = () => undefined;
  test.use({
    backend: {
      ...backend,
      seriesBooks: async (id, listing, after) => {
        if (listing.section === "chapters") {
          await new Promise<void>((resolve) => {
            releaseChapters = resolve;
          });
        }
        return backend.seriesBooks(id, listing, after);
      },
    },
  });

  test("shows no volume under Chapters while the chapters load", async ({
    page,
  }) => {
    test.skip(!isWide(page), "narrower windows keep one list");
    await openSeries(page);
    await expect(covers(page, "Volumes")).toHaveCount(2);

    await kinds(page).getByRole("tab", { name: "Chapters" }).click();

    await expect(page.getByRole("table", { name: "Books" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Volumes" })).toHaveCount(0);
    releaseChapters();
    await expect(bookRows(page)).toHaveText([/chapter 13/, /chapter 14/]);
  });
});

test.describe("a series read across the wide breakpoint", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({ backend: shelf.backend() });

  test("lists the books each width shows", async ({ page }) => {
    test.skip(!isWide(page), "only a wide window shows tabs");
    const { width, height } = viewportOf(page);
    await openSeries(page);
    await expect(covers(page, "Volumes")).toHaveCount(2);

    await page.setViewportSize({ width: NARROW_WIDTH, height });

    await expect(
      page.getByRole("list", { name: "Books" }).getByRole("link"),
    ).toContainText([/volume 01/, /volume 02/, /chapter 13/]);

    await page.setViewportSize({ width, height });

    await expect(covers(page, "Volumes")).toHaveText([/Volume 1/, /Volume 2/]);
  });
});

test.describe("a series whose specials a rescan takes away", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({ backend: shelf.backend() });

  test("goes back to the volumes once Specials is gone", async ({ page }) => {
    test.skip(!isWide(page), "narrower windows keep one list");
    await openSeries(page);
    await kinds(page).getByRole("tab", { name: "Specials" }).click();
    await expect(covers(page, "Specials")).toHaveCount(1);

    shelf.drop("specials");
    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(kinds(page).getByRole("tab")).toHaveCount(2);
    await expect(covers(page, "Volumes")).toHaveText([/Volume 1/, /Volume 2/]);
  });
});

test.describe("a series with a read chapter", () => {
  const shelf = new SectionShelf([
    ...volumes(1),
    READ_CHAPTER,
    ...chapters(13),
  ]);
  test.use({ backend: shelf.backend() });

  test("keeps the chapters' Unread filter across a visit to Volumes", async ({
    page,
  }) => {
    test.skip(!isWide(page), "narrower windows keep one list");
    await openSeries(page);
    await kinds(page).getByRole("tab", { name: "Chapters" }).click();
    await page
      .getByRole("group", { name: "Show" })
      .getByRole("radio", { name: "Unread", exact: true })
      .click();
    await expect(bookRows(page)).toHaveText([/chapter 13/]);

    await kinds(page).getByRole("tab", { name: "Volumes" }).click();
    await expect(covers(page, "Volumes")).toHaveCount(1);
    await kinds(page).getByRole("tab", { name: "Chapters" }).click();

    await expect(bookRows(page)).toHaveText([/chapter 13/]);
  });
});

test.describe("a series' section tabs on iOS", { tag: "@native" }, () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({ platform: "ios", backend: shelf.backend() });

  test("draws the section tabs as a segmented control", async ({ page }) => {
    await page.setViewportSize({ width: EXPANDED_MIN_WIDTH, height: 900 });
    await openSeries(page);

    const chosen = kinds(page).getByRole("tab", { name: "Volumes" });
    await expect(chosen).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-segment-selected"),
    );
    await expect(kinds(page)).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-segmented-track"),
    );
  });
});
