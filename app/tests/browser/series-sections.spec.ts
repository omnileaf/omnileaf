import type { Page } from "@playwright/test";

import { emitFakeEvent } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
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
const PHONE_IN_LANDSCAPE = { width: 700, height: 360 };
const PHONE_IN_PORTRAIT = { width: 360, height: 800 };
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

test.describe("a series' books read tab by tab", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({ platform: "linux", backend: shelf.backend() });

  test("reads the books once when another tab is chosen", async ({ page }) => {
    test.skip(!isWide(page), "only a wide window shows tabs");
    await openSeries(page);
    await expect(covers(page, "Volumes")).toHaveCount(2);
    const before = shelf.listings.length;

    await kinds(page)
      .getByRole("tab", { name: /Chapters/ })
      .click();

    await expect(
      page
        .getByRole("table", { name: "Books" })
        .or(page.getByRole("list", { name: "Books" })),
    ).toContainText(/chapter 13/);
    expect(shelf.listings.length - before).toBe(1);
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

test.describe("a series' section tabs on an iPhone", { tag: "@native" }, () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({
    platform: "ios",
    backend: shelf.backend(),
    viewport: { width: 390, height: 844 },
  });

  test("shows a tab for each kind of book with volumes as covers", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(kinds(page).getByRole("tab")).toHaveText([
      /Volumes/,
      /Chapters/,
      /Specials/,
    ]);
    await expect(covers(page, "Volumes")).toHaveCount(2);
  });

  test("puts the search and sort row above the tabs", async ({ page }) => {
    await openSeries(page);

    const [tabs, search] = await Promise.all([
      boxOf(kinds(page)),
      boxOf(page.getByRole("searchbox", { name: "Find a book" })),
    ]);

    expect(search.y + search.height).toBeLessThanOrEqual(tabs.y);
  });

  test("lists only the chapters once Chapters is chosen", async ({ page }) => {
    await openSeries(page);

    await kinds(page)
      .getByRole("tab", { name: /Chapters/ })
      .click();

    await expect(
      page
        .getByRole("table", { name: "Books" })
        .or(page.getByRole("list", { name: "Books" })),
    ).toContainText(/chapter 13/);
    await expect(covers(page, "Volumes")).toHaveCount(0);
  });
});

test.describe(
  "a series' section tabs on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = new SectionShelf(EVERY_KIND);
    test.use({
      platform: "android",
      backend: shelf.backend(),
      viewport: { width: 360, height: 800 },
    });

    test("shows a tab for each kind of book with volumes as covers", async ({
      page,
    }) => {
      await openSeries(page);

      await expect(kinds(page).getByRole("tab")).toHaveText([
        /Volumes/,
        /Chapters/,
        /Specials/,
      ]);
      await expect(covers(page, "Volumes")).toHaveCount(2);
    });

    test("heads the tabs with the chosen kind's count, Find a book and Sort and filter", async ({
      page,
    }) => {
      await openSeries(page);

      const heading = page.getByRole("heading", {
        level: 2,
        name: "2 volumes",
      });
      const [tabs, title, find, sort] = await Promise.all([
        boxOf(kinds(page)),
        boxOf(heading),
        boxOf(page.getByRole("button", { name: "Find a book" })),
        boxOf(page.getByRole("button", { name: "Sort and filter" })),
      ]);

      expect(
        [title, find, sort].every((part) => part.y + part.height <= tabs.y),
      ).toBe(true);
      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveCount(0);
    });

    test("names the chosen kind in the heading", async ({ page }) => {
      await openSeries(page);

      await kinds(page)
        .getByRole("tab", { name: /Specials/ })
        .click();

      await expect(
        page.getByRole("heading", { level: 2, name: "1 special" }),
      ).toBeVisible();
    });

    test("opens the search field under the tabs from Find a book", async ({
      page,
    }) => {
      await openSeries(page);
      const find = page.getByRole("button", { name: "Find a book" });

      await find.click();

      const field = page.getByRole("searchbox", { name: "Find a book" });
      await expect(field).toBeFocused();
      await expect(find).toHaveAttribute("aria-expanded", "true");
      const [tabs, search] = await Promise.all([
        boxOf(kinds(page)),
        boxOf(field),
      ]);
      expect(search.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
    });

    test("opens Sort and filter as a sheet", async ({ page }) => {
      await openSeries(page);

      await page.getByRole("button", { name: "Sort and filter" }).click();

      await expect(
        page.getByRole("dialog", { name: "Sort and filter" }),
      ).toBeVisible();
    });

    test("lists the chapters as rows once Chapters is chosen", async ({
      page,
    }) => {
      await openSeries(page);

      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();

      await expect(
        page
          .getByRole("table", { name: "Books" })
          .or(page.getByRole("list", { name: "Books" })),
      ).toContainText(/chapter 13/);
      await expect(covers(page, "Volumes")).toHaveCount(0);
    });

    test("lists the specials as covers once Specials is chosen", async ({
      page,
    }) => {
      await openSeries(page);

      await kinds(page)
        .getByRole("tab", { name: /Specials/ })
        .click();

      await expect(covers(page, "Specials")).toHaveCount(1);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openSeries(page);
        await expect(kinds(page).getByRole("tab")).toHaveCount(3);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

test.describe(
  "a series' tabs with read books on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = new SectionShelf(
      [
        {
          kind: "volume",
          numbers: { first: 1, last: 1 },
          reading: { state: "read" },
        },
        ...volumes(2, 4),
        READ_CHAPTER,
        ...chapters(13),
      ],
      [{ first: 3, last: 3 }],
    );
    test.use({
      platform: "android",
      backend: shelf.backend(),
      viewport: { width: 360, height: 800 },
    });

    function phoneRows(page: Page) {
      return page.getByRole("list", { name: "Books" }).getByRole("listitem");
    }

    async function showOnly(page: Page, shown: string): Promise<void> {
      await page.getByRole("button", { name: "Sort and filter" }).click();
      const sheet = page.getByRole("dialog", { name: "Sort and filter" });
      await sheet.getByRole("radio", { name: shown, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }

    test("keeps the Show group and a second Find a book out of the Chapters tab", async ({
      page,
    }) => {
      await openSeries(page);

      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();

      await expect(phoneRows(page)).toHaveCount(2);
      await expect(page.getByRole("radiogroup", { name: "Show" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Find a book" }),
      ).toHaveCount(1);
    });

    test("finds a chapter from the heading's Find a book", async ({ page }) => {
      await openSeries(page);
      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();

      await page.getByRole("button", { name: "Find a book" }).click();
      await page.getByRole("searchbox", { name: "Find a book" }).fill("13");

      await expect(phoneRows(page)).toHaveCount(1);
      await expect(phoneRows(page)).toContainText(/chapter 13/);
    });

    test("shows only the unread chapters once Sort and filter says Unread", async ({
      page,
    }) => {
      await openSeries(page);
      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();

      await showOnly(page, "Unread");

      await expect(phoneRows(page)).toHaveCount(1);
      await expect(phoneRows(page)).toContainText(/chapter 13/);
    });

    test("hides the field and clears the search when Find a book is pressed again", async ({
      page,
    }) => {
      await openSeries(page);
      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();
      const find = page.getByRole("button", { name: "Find a book" });
      await find.click();
      await page.getByRole("searchbox", { name: "Find a book" }).fill("13");
      await expect(phoneRows(page)).toHaveCount(1);

      await find.click();

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveCount(0);
      await expect(phoneRows(page)).toHaveCount(2);
    });

    test("clears the search when another tab is chosen", async ({ page }) => {
      await openSeries(page);
      await page.getByRole("button", { name: "Find a book" }).click();
      await page.getByRole("searchbox", { name: "Find a book" }).fill("2");
      await expect(covers(page, "Volumes")).toHaveCount(1);

      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveValue("");
      await expect(phoneRows(page)).toHaveCount(2);
    });

    test("clears the search from Clear the search when no chapter matches", async ({
      page,
    }) => {
      await openSeries(page);
      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();
      await page.getByRole("button", { name: "Find a book" }).click();
      await page
        .getByRole("searchbox", { name: "Find a book" })
        .fill("harbour");

      await page.getByRole("button", { name: "Clear the search" }).click();

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveValue("");
      await expect(phoneRows(page)).toHaveCount(2);
    });

    test("shows the selection bar while picking on the Chapters tab and goes back to the heading after", async ({
      page,
    }) => {
      await openSeries(page);
      await kinds(page)
        .getByRole("tab", { name: /Chapters/ })
        .click();
      await expect(
        page.getByRole("region", { name: "2 chapters" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /^More for .*chapter 13/ })
        .click();
      await page
        .getByRole("button", { name: "Select", exact: true })
        .or(page.getByRole("menuitem", { name: "Select", exact: true }))
        .click();
      await expect(
        page.getByRole("heading", { level: 2, name: "1 selected" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Clear the selection" }).click();

      await expect(
        page.getByRole("heading", { level: 2, name: "2 chapters" }),
      ).toBeFocused();
      await expect(
        page.getByRole("heading", { level: 2, name: /books$/ }),
      ).toHaveCount(0);
    });

    test("closes Find a book and lists every cover again after a turn to landscape and back", async ({
      page,
    }) => {
      await openSeries(page);
      await page.getByRole("button", { name: "Find a book" }).click();
      await page.getByRole("searchbox", { name: "Find a book" }).fill("2");
      await expect(covers(page, "Volumes")).toHaveCount(1);

      await page.setViewportSize(PHONE_IN_LANDSCAPE);
      await expect(
        page.getByRole("button", { name: "Sort and filter" }),
      ).toHaveCount(0);
      await page.setViewportSize(PHONE_IN_PORTRAIT);

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveCount(0);
      await expect(covers(page, "Volumes")).toHaveCount(3);
    });

    test("keeps Sort and filter closed after a turn to landscape and back", async ({
      page,
    }) => {
      await openSeries(page);
      await page.getByRole("button", { name: "Sort and filter" }).click();
      await expect(
        page.getByRole("dialog", { name: "Sort and filter" }),
      ).toBeVisible();

      await page.setViewportSize(PHONE_IN_LANDSCAPE);
      await expect(
        page.getByRole("button", { name: "Sort and filter" }),
      ).toHaveCount(0);
      await page.setViewportSize(PHONE_IN_PORTRAIT);

      await expect(
        page.getByRole("dialog", { name: "Sort and filter" }),
      ).toHaveCount(0);
    });

    test("lists every cover again after a search in landscape and a turn back to portrait", async ({
      page,
    }) => {
      await page.setViewportSize(PHONE_IN_LANDSCAPE);
      await openSeries(page);
      await page.getByRole("searchbox", { name: "Find a book" }).fill("2");
      await expect(covers(page, "Volumes")).toHaveCount(1);

      await page.setViewportSize(PHONE_IN_PORTRAIT);

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveCount(0);
      await expect(covers(page, "Volumes")).toHaveCount(3);
    });

    test("clears a cover search with no match from Clear the search", async ({
      page,
    }) => {
      await openSeries(page);
      await page.getByRole("button", { name: "Find a book" }).click();
      await page
        .getByRole("searchbox", { name: "Find a book" })
        .fill("harbour");

      await page.getByRole("button", { name: "Clear the search" }).click();

      await expect(
        page.getByRole("searchbox", { name: "Find a book" }),
      ).toHaveValue("");
      await expect(covers(page, "Volumes")).toHaveCount(3);
    });

    test("closes Sort and filter back to its button", async ({ page }) => {
      await openSeries(page);
      const sortAndFilter = page.getByRole("button", {
        name: "Sort and filter",
      });
      await sortAndFilter.click();

      await page.keyboard.press("Escape");

      await expect(
        page.getByRole("dialog", { name: "Sort and filter" }),
      ).toBeHidden();
      await expect(sortAndFilter).toHaveAttribute("aria-expanded", "false");
      await expect(sortAndFilter).toBeFocused();
    });

    test("says when no volume is bookmarked and shows them all again from Show all books", async ({
      page,
    }) => {
      await openSeries(page);

      await showOnly(page, "Bookmarked");
      await expect(
        page.getByText("No book in this series has a bookmark."),
      ).toBeVisible();
      await page.getByRole("button", { name: "Show all books" }).click();

      await expect(covers(page, "Volumes")).toHaveCount(3);
    });

    test("shows only the unread volumes, with no gap, once Sort and filter says Unread", async ({
      page,
    }) => {
      await openSeries(page);
      await expect(
        page.getByRole("img", { name: /not in the folder/ }),
      ).toHaveCount(1);

      await showOnly(page, "Unread");

      await expect(covers(page, "Volumes")).toHaveCount(2);
      await expect(
        page.getByRole("img", { name: /not in the folder/ }),
      ).toHaveCount(0);
    });
  },
);

test.describe("a series on a narrow linux window", () => {
  const shelf = new SectionShelf(EVERY_KIND);
  test.use({
    platform: "linux",
    backend: shelf.backend(),
    viewport: { width: NARROW_WIDTH, height: 800 },
  });

  test("keeps every book in one list under the search and sort row", async ({
    page,
  }) => {
    await openSeries(page);

    await expect(kinds(page)).toHaveCount(0);
    await expect(
      page.getByRole("list", { name: "Books" }).getByRole("listitem").first(),
    ).toBeVisible();
  });
});
