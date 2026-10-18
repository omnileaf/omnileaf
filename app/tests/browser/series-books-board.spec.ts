import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const ON_PAGE_14 = { state: "started", page: 14 } as const;
const PAGE_COUNT = 192;
const SEARCH_WIDTH = 220;
const ROW_HEIGHT = { phone: 77, desktop: 52 };
const DESKTOP_WINDOW_WIDTHS = [840, 1024, 1200, 1280];
const BOARD_WIDTH = 1280;
const WINDOW_HEIGHT = 800;

function eightBooks(): FakeShelf {
  const shelf = new FakeShelf(
    [READ, READ, ON_PAGE_14, ...Array.from({ length: 5 }, () => NOT_STARTED)],
    {},
    PAGE_COUNT,
  );
  shelf.bookmark(1);
  shelf.bookmark(4);
  shelf.markNew(7);
  return shelf;
}

const shelf = eightBooks();

test.use({ backend: shelf.backend() });

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function rows(page: Page): Locator {
  return isWide(page)
    ? page
        .getByRole("table", { name: "Books" })
        .getByRole("row")
        .filter({ has: page.getByRole("link") })
    : page.getByRole("list", { name: "Books" }).getByRole("listitem");
}

function titleOf(row: Locator, index: number): Locator {
  return row.getByText(shelf.titleOf(index), { exact: true });
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

async function openBooks(page: Page): Promise<void> {
  await openSeries(page);
  await rows(page).first().scrollIntoViewIfNeeded();
}

function showChoice(page: Page, name: string): Locator {
  return page.getByRole("group", { name: "Show" }).getByRole("radio", { name });
}

function booksTable(page: Page): Locator {
  return page.getByRole("table", { name: "Books" });
}

async function openBooksInWindow(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: WINDOW_HEIGHT });
  await openSeries(page);
  await booksTable(page).scrollIntoViewIfNeeded();
  await expect(rows(page).first()).toBeVisible();
}

function booksCard(page: Page): Locator {
  return page.locator("[data-slot='card']").filter({ has: booksTable(page) });
}

function headersOutsideCard(
  table: Locator,
): Promise<{ tableWidth: number; cardWidth: number; outside: string[] }> {
  return table.evaluate((element) => {
    const card = element.closest("[data-slot='card']");
    if (card === null) {
      throw new Error("the books table sits in no card");
    }
    const start = card.getBoundingClientRect().left + card.clientLeft;
    const end = start + card.clientWidth;
    return {
      tableWidth: element.scrollWidth,
      cardWidth: card.clientWidth,
      outside: [...element.querySelectorAll("th")]
        .filter((head) => {
          const { left, right } = head.getBoundingClientRect();
          return left < start || right > end;
        })
        .map((head) => head.textContent.trim()),
    };
  });
}

test("counts the books read and bookmarked beside the books' heading", async ({
  page,
}) => {
  await openBooks(page);
  const heading = page.getByRole("heading", { level: 2, name: "8 books" });

  if (isWide(page)) {
    await expect(heading).toHaveClass(/sr-only/);
  } else {
    await expect(heading).toBeVisible();
    await expect(page.getByText("2 read · 2 bookmarked")).toBeVisible();
  }
});

test("says how far each book is read and how many pages it has", async ({
  page,
}) => {
  await openBooks(page);

  if (isWide(page)) {
    await expect(rows(page).nth(0)).toContainText("Read");
    await expect(rows(page).nth(0)).toContainText("192");
    await expect(rows(page).nth(2)).toContainText("Page 14 of 192");
    await expect(rows(page).nth(3)).toContainText("Unread");
  } else {
    await expect(rows(page).nth(0)).toContainText("Read · 192 pages");
    await expect(rows(page).nth(2)).toContainText("Page 14 of 192");
    await expect(rows(page).nth(3)).toContainText("Unread · 192 pages");
  }
  await expect(
    rows(page).nth(2).getByRole("progressbar", { name: "Page 14 of 192" }),
  ).toBeVisible();
});

test("marks a bookmarked book and a new one", async ({ page }) => {
  await openBooks(page);
  const row = (index: number): Locator =>
    rows(page).filter({ hasText: shelf.titleOf(index) });

  await expect(row(1).getByRole("img", { name: "Bookmarked" })).toBeVisible();
  await expect(row(0).getByRole("img", { name: "Bookmarked" })).toHaveCount(0);
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: main.scrollHeight });
  });
  await expect(row(7).getByText("New", { exact: true })).toBeVisible();
});

test("shows only the bookmarked books", async ({ page }) => {
  await openBooks(page);

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("radio", { name: "Bookmarked" })
    .click();

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText(shelf.titleOf(1));
  await expect(rows(page).nth(1)).toContainText(shelf.titleOf(4));
});

test("marks a new book in the secondary badge's ink", async ({ page }) => {
  await openBooks(page);
  await page.getByRole("main").evaluate((main) => {
    main.scrollTo({ top: main.scrollHeight });
  });

  const badge = rows(page)
    .filter({ hasText: shelf.titleOf(7) })
    .getByText("New", { exact: true });

  await expect(badge).toHaveCSS(
    "color",
    await tokenColour(page, "--secondary-foreground"),
  );
});

test("sets the chosen show choice semibold in the accent's ink and the rest medium in the foreground", async ({
  page,
}) => {
  await openBooks(page);

  await expect(showChoice(page, "All")).toHaveCSS("font-weight", "600");
  await expect(showChoice(page, "All")).toHaveCSS(
    "color",
    await tokenColour(page, "--accent-foreground"),
  );
  await expect(showChoice(page, "Unread")).toHaveCSS("font-weight", "500");
  await expect(showChoice(page, "Unread")).toHaveCSS(
    "color",
    await tokenColour(page, "--foreground"),
  );
});

test("keeps a show choice as wide once it is chosen", async ({ page }) => {
  await openBooks(page);
  const unread = showChoice(page, "Unread");
  const before = await boxOf(unread);

  await unread.click();

  await expect(unread).toHaveAttribute("aria-checked", "true");
  expect((await boxOf(unread)).width).toBe(before.width);
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: { ...shelf.backend(), appInfo: () => fakeAppInfo(platform) },
    });

    test("sets the chosen show choice semibold in the foreground", async ({
      page,
    }) => {
      await openBooks(page);

      await expect(showChoice(page, "All")).toHaveCSS("font-weight", "600");
      await expect(showChoice(page, "All")).toHaveCSS(
        "color",
        await tokenColour(page, "--foreground"),
      );
    });
  });
}

test("names a read book in muted type and the rest in the foreground", async ({
  page,
}) => {
  await openBooks(page);

  await expect(titleOf(rows(page).nth(0), 0)).toHaveCSS(
    "color",
    await tokenColour(page, "--muted-foreground"),
  );
  await expect(titleOf(rows(page).nth(3), 3)).toHaveCSS(
    "color",
    await tokenColour(page, "--foreground"),
  );
  await expect(titleOf(rows(page).nth(3), 3)).toHaveCSS(
    "font-weight",
    isWide(page) ? "400" : "500",
  );
});

test("sizes the rows as the boards do", async ({ page }) => {
  await openBooks(page);

  const row = await boxOf(rows(page).nth(3));

  expect(row.height).toBe(isWide(page) ? ROW_HEIGHT.desktop : ROW_HEIGHT.phone);
});

test("finds a book from a field beside the show choices on desktops", async ({
  page,
}) => {
  await openBooks(page);
  test.skip(!isWide(page), "phones open the field from a button");

  const field = page.getByRole("searchbox", { name: "Find a book" });

  expect((await boxOf(field.locator(".."))).width).toBe(SEARCH_WIDTH);
  await expect(
    page
      .getByRole("button", { name: "Sort: In order" })
      .getByText("Sort: In order"),
  ).toBeVisible();
});

test.describe("in a desktop window with the sidebar showing", () => {
  test.skip(({ isMobile }) => isMobile, "the desktop's sidebar and table");

  for (const width of DESKTOP_WINDOW_WIDTHS) {
    test(`keeps the page from scrolling sideways ${String(width)}px wide`, async ({
      page,
    }) => {
      await openBooksInWindow(page, width);

      const main = page.getByRole("main");
      const scroll = await main.evaluate((element) => ({
        content: element.scrollWidth,
        shown: element.clientWidth,
      }));

      expect(scroll.content).toBeLessThanOrEqual(scroll.shown);
    });

    test(`fits every column of the books table in its card ${String(width)}px wide`, async ({
      page,
    }) => {
      await openBooksInWindow(page, width);

      const fit = await headersOutsideCard(booksTable(page));

      expect(fit.tableWidth).toBeLessThanOrEqual(fit.cardWidth);
      expect(fit.outside).toEqual([]);
    });
  }

  test(`lays the series' details beside the books ${String(BOARD_WIDTH)}px wide, as the boards do`, async ({
    page,
  }) => {
    await openBooksInWindow(page, BOARD_WIDTH);

    const about = await boxOf(
      page.getByRole("region", { name: "About this series" }),
    );
    const books = await boxOf(booksCard(page));

    expect(about.x + about.width).toBeLessThanOrEqual(books.x);
    expect(about.y).toBeLessThan(books.y + books.height);
  });
});
