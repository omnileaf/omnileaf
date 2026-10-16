import type { Locator, Page } from "@playwright/test";

import {
  CommandFailure,
  type FakeBackend,
  fakeProtocolRoute,
} from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const THURSDAY_EVENING = new Date("2026-10-08T22:30:00Z");
const MINUTE = 60;
const DAY_MS = 86_400_000;
const ENTRIES_PER_PAGE = 50;
const REMOVED_MARK = 1_790_000_000_000;
const CLEARED_MARK = 1_780_000_000_000;

function bookId(number: number): string {
  return `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`;
}

function seriesId(number: number): string {
  return `0190a3e4-0000-8000-8001-${String(number).padStart(12, "0")}`;
}

function seriesTitle(number: number): string {
  return `Sample Series ${String(number).padStart(2, "0")}`;
}

function bookTitle(number: number): string {
  return `Volume ${String(number)}`;
}

function entry(
  number: number,
  startedAt: string,
  readTo: WireEntry["readTo"],
): WireEntry {
  return {
    book: bookId(number),
    bookTitle: bookTitle(number),
    series: seriesId(number),
    seriesTitle: seriesTitle(number),
    position: number,
    cover: null,
    startedAtMs: Date.parse(startedAt),
    utcOffsetMinutes: 0,
    readSeconds: 20 * MINUTE,
    readTo,
    reading:
      readTo.state === "end"
        ? { state: "read" }
        : { state: "started", page: readTo.page },
    day: {
      day: Math.floor(Date.parse(startedAt) / DAY_MS),
      readSeconds: 20 * MINUTE,
    },
  };
}

const BOOKS: readonly WireEntry[] = [
  entry(4, "2026-10-08T21:40:00.000Z", {
    state: "page",
    page: 14,
    pageCount: 192,
  }),
  entry(7, "2026-10-08T08:12:00.000Z", { state: "end" }),
  entry(1, "2026-10-07T22:05:00.000Z", {
    state: "page",
    page: 3,
    pageCount: 24,
  }),
  entry(3, "2026-10-05T19:30:00.000Z", {
    state: "page",
    page: 18,
    pageCount: 40,
  }),
  entry(6, "2026-09-29T20:10:00.000Z", {
    state: "page",
    page: 40,
    pageCount: 180,
  }),
];

let removed = new Set<string>();
let isCleared = false;
let asked: string[] = [];

function booksBackend(books: readonly WireEntry[]): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    readingHistory: (after, of) => {
      const matching = of.kind === "books" ? of.matching.toLowerCase() : "";
      const shown = books.filter(
        (one) =>
          !isCleared &&
          !removed.has(one.book) &&
          (one.seriesTitle.toLowerCase().includes(matching) ||
            one.bookTitle.toLowerCase().includes(matching)),
      );
      const start = after === null ? 0 : Number(after);
      const end = start + ENTRIES_PER_PAGE;
      return {
        entries: shown.slice(start, end),
        next: end < shown.length ? String(end) : null,
      };
    },
    removeFromHistory: (book) => {
      removed.add(book);
      asked.push(`remove ${book}`);
      return REMOVED_MARK;
    },
    restoreToHistory: (book, mark) => {
      removed.delete(book);
      asked.push(`restore ${book} ${String(mark)}`);
      return null;
    },
    clearHistory: () => {
      isCleared = true;
      asked.push("clear");
      return CLEARED_MARK;
    },
    restoreHistory: (mark) => {
      isCleared = false;
      asked.push(`restore all ${String(mark)}`);
      return null;
    },
  };
}

test.beforeEach(() => {
  removed = new Set();
  isCleared = false;
  asked = [];
});

function isDesktop(page: Page): boolean {
  return viewportOf(page).width >= LARGE_MIN_WIDTH;
}

function groups(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

function rows(page: Page): Locator {
  return page.getByRole("main").getByRole("listitem");
}

function rowOf(page: Page, number: number): Locator {
  return rows(page).filter({ hasText: seriesTitle(number) });
}

async function openHistory(page: Page): Promise<void> {
  await page.clock.setFixedTime(THURSDAY_EVENING);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "History" }),
  ).toBeVisible();
}

async function openMenuOf(page: Page, number: number): Promise<Locator> {
  await rowOf(page, number)
    .getByRole("button", { name: `More for ${bookTitle(number)}` })
    .click();
  return isDesktop(page) ? page.getByRole("menu") : page.getByRole("dialog");
}

function menuAction(menu: Locator, page: Page, name: string): Locator {
  return isDesktop(page)
    ? menu.getByRole("menuitem", { name })
    : menu.getByRole("button", { name });
}

async function search(page: Page, text: string): Promise<void> {
  const field = page.getByRole("searchbox", { name: "Search History" });
  if (!(await field.isVisible())) {
    await page.getByRole("button", { name: "Search History" }).click();
  }
  await field.fill(text);
}

test.describe("with books read", () => {
  test.use({ backend: booksBackend(BOOKS) });

  test("lists each book read once, newest first, under Today, Yesterday, This week and Earlier", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(groups(page)).toHaveText([
      "Today",
      "Yesterday",
      "This week",
      "Earlier",
    ]);
    await expect(rows(page)).toHaveCount(BOOKS.length);
  });

  test("says where each book was left and when", async ({ page }) => {
    await openHistory(page);

    await expect(rowOf(page, 4)).toContainText(
      /Volume 4 · page 14 of 192 · 9:40\sPM/,
    );
    await expect(rowOf(page, 7)).toContainText("Volume 7 · finished ·");
    await expect(rowOf(page, 3)).toContainText(
      "Volume 3 · page 18 of 40 · Monday",
    );
    await expect(rowOf(page, 6)).toContainText(
      /Volume 6 · page 40 of 180 · Sep 29/,
    );
  });

  test("continues a book from its entry", async ({ page }) => {
    await openHistory(page);

    await rowOf(page, 4).getByRole("link").click();

    await expect(page).toHaveURL(new RegExp(`/read/${bookId(4)}$`));
  });

  test("offers Continue reading, Open the series and Remove from History in an entry's menu", async ({
    page,
  }) => {
    await openHistory(page);

    const menu = await openMenuOf(page, 7);

    await expect(menuAction(menu, page, "Continue reading")).toBeVisible();
    await expect(menuAction(menu, page, "Open the series")).toBeVisible();
    await expect(menuAction(menu, page, "Remove from History")).toBeVisible();
  });

  test("opens the series from an entry's menu", async ({ page }) => {
    await openHistory(page);

    const menu = await openMenuOf(page, 7);
    await menuAction(menu, page, "Open the series").click();

    await expect(page).toHaveURL(new RegExp(`/series/${seriesId(7)}$`));
  });

  test("removes an entry at once, and puts it back with Undo", async ({
    page,
  }) => {
    await openHistory(page);

    const menu = await openMenuOf(page, 7);
    await menuAction(menu, page, "Remove from History").click();
    await expect(rowOf(page, 7)).toHaveCount(0);
    await expect(page.getByText("Removed from History")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(rowOf(page, 7)).toHaveCount(1);
    expect(asked).toEqual([
      `remove ${bookId(7)}`,
      `restore ${bookId(7)} ${String(REMOVED_MARK)}`,
    ]);
  });

  test("clears History at once, and brings it back with Undo", async ({
    page,
  }) => {
    await openHistory(page);

    await page.getByRole("button", { name: "Clear History" }).click();
    await expect(
      page.getByRole("heading", { name: "History is empty" }),
    ).toBeVisible();
    await expect(
      page.getByText("Books you open from now on show up here."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(rows(page)).toHaveCount(BOOKS.length);
    expect(asked).toEqual(["clear", `restore all ${String(CLEARED_MARK)}`]);
  });

  test("finds books by series or book title, and says when nothing matches", async ({
    page,
  }) => {
    await openHistory(page);

    await search(page, "series 04");
    await expect(rows(page)).toHaveCount(1);
    await search(page, "harbor");

    await expect(
      page.getByRole("heading", {
        name: "Nothing in History matches “harbor”",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("History searches series and book titles."),
    ).toBeVisible();
  });

  test("searches with Ctrl F on a desktop", async ({ page }) => {
    test.skip(!isDesktop(page), "desktops search from the keyboard");
    await openHistory(page);
    await rows(page).first().getByRole("link").focus();

    await page.keyboard.press("Control+f");

    await expect(
      page.getByRole("searchbox", { name: "Search History" }),
    ).toBeFocused();
  });

  test("moves between entries with the arrow keys and removes one with Delete on a desktop", async ({
    page,
  }) => {
    test.skip(!isDesktop(page), "desktops move through History by key");
    await openHistory(page);
    await rowOf(page, 4).getByRole("link").focus();

    await page.keyboard.press("ArrowDown");
    await expect(rowOf(page, 7).getByRole("link")).toBeFocused();
    await page.keyboard.press("Delete");

    await expect(rowOf(page, 7)).toHaveCount(0);
    await expect(page.getByText("Removed from History")).toBeVisible();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openHistory(page);
      await expect(rows(page)).toHaveCount(BOOKS.length);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("before anything is read", () => {
  test.use({ backend: booksBackend([]) });

  test("says nothing is read yet, with a way to the library", async ({
    page,
  }) => {
    await openHistory(page);

    await expect(
      page.getByRole("heading", { name: "Nothing read yet" }),
    ).toBeVisible();
    await expect(
      page.getByText("Books you open show up here, newest first."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to the library" }).click();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("while History is read", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      readingHistory: () => new Promise(() => undefined),
    },
  });

  test("shows rows in the list's own shape", async ({ page }) => {
    await openHistory(page);

    await expect(
      page.getByRole("status", { name: "Loading History" }),
    ).toBeVisible();
  });
});

test.describe("with a long history", () => {
  const many = Array.from({ length: 2 * ENTRIES_PER_PAGE + 10 }, (_, index) =>
    entry(
      index + 1,
      new Date(
        THURSDAY_EVENING.getTime() - (index + 1) * 60 * MINUTE * 1000,
      ).toISOString(),
      { state: "page", page: 14, pageCount: 30 },
    ),
  );

  test.use({ backend: booksBackend(many) });

  test("reads older books as the list scrolls to its end", async ({ page }) => {
    await openHistory(page);
    await expect(rows(page)).toHaveCount(ENTRIES_PER_PAGE);

    for (const shown of [2 * ENTRIES_PER_PAGE, many.length]) {
      await rows(page).last().scrollIntoViewIfNeeded();
      await expect(rows(page)).toHaveCount(shown);
    }
  });
});

test.describe("when History can't be read", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      readingHistory: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library database is unreadable",
        });
      },
    },
  });

  test("says History couldn't be loaded", async ({ page }) => {
    await openHistory(page);

    await expect(
      page.getByText("Couldn't load your history. Try again later."),
    ).toBeVisible();
  });
});

test.describe("with Screenshot mode on", () => {
  let coverRequests = 0;

  test.use({
    backend: booksBackend(
      BOOKS.map((one) => ({ ...one, cover: `thumb/v1/${one.book}/1/1` })),
    ),
  });

  test.beforeEach(async ({ page }) => {
    coverRequests = 0;
    await page.route(fakeProtocolRoute("omni"), (route) => {
      coverRequests += 1;
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
  });

  test("shows stand-ins for every series and book, asks for no cover and keeps the times real", async ({
    page,
  }) => {
    await openHistory(page);
    await expect(rows(page)).toHaveCount(BOOKS.length);

    await expect(rows(page).first()).toContainText(/9:40\sPM/);
    expect(await page.content()).not.toContain("Sample Series");
    expect(coverRequests).toBe(0);
  });
});
