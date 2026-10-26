import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";
import type { WireBook } from "./series-shelf.ts";

const PAGES = 30;
const PHONE_TITLE_TRIGGER_PX = 48;
const DESKTOP_CRUMB_TRIGGER_PX = 32;
const IOS_TOUCH_TARGET_PX = 44;
const IOS_NAMED_BACK_MAX_PX = 168;

function bookAt(index: number, change: Partial<WireBook> = {}): WireBook {
  const id = `0190a3e4-0000-8000-8000-0000000000${(0xb0 + index).toString(16)}`;
  return {
    id,
    position: index + 1,
    title: `${BOOK_SERIES_TITLE} v${String(index + 1).padStart(2, "0")}`,
    addedAtMs: 0,
    reading: index === 0 ? { state: "read" } : { state: "notStarted" },
    pageCount: PAGES,
    isBookmarked: false,
    isNew: false,
    isFileMissing: false,
    ...change,
  };
}

function shelfOf(books: readonly WireBook[]): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND),
    seriesBooks: () => ({ books: [...books], next: null }),
  };
}

const PICKED = bookAt(3);
const MISSING = bookAt(4, { isFileMissing: true });
const UNREAD = bookAt(5);
const EIGHT_BOOKS = [
  bookAt(0),
  bookAt(1, { reading: { state: "started", page: 1 } }),
  bookAt(2, { isBookmarked: true }),
  PICKED,
  MISSING,
  UNREAD,
  bookAt(6),
  bookAt(7),
];

test.use({ backend: shelfOf(EIGHT_BOOKS) });

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function jumpTrigger(page: Page): Locator {
  return page
    .locator("main > header")
    .getByRole("button", { name: "Jump to a book" });
}

function jumpList(page: Page): Locator {
  return isWide(page)
    ? page.getByRole("complementary", { name: "Jump to a book" })
    : page.getByRole("dialog", { name: "Jump to a book" });
}

async function openJumpList(page: Page): Promise<Locator> {
  await jumpTrigger(page).click();
  const list = jumpList(page);
  await expect(list).toBeVisible();
  await settle(list);
  return list;
}

test("opens Jump to a book from the book's name, the book being read marked in the list", async ({
  page,
}) => {
  await openBook(page);

  const list = await openJumpList(page);

  await expect(list).toContainText(`${BOOK_SERIES_TITLE} · 8 books`);
  await expect(list.getByRole("link")).toHaveCount(7);
  const current = list.getByRole("link", { name: new RegExp(BOOK_TITLE) });
  await expect(current).toHaveAttribute("aria-current", "true");
  await expect(current).toContainText("Reading");
  await expect(current).toBeInViewport();
});

test("opens Jump to a book from a title 48px tall", async ({ page }) => {
  test.skip(isWide(page), "wide screens open it from the breadcrumb");
  await openBook(page);

  const title = await boxOf(jumpTrigger(page));

  expect(title.height).toBeGreaterThanOrEqual(PHONE_TITLE_TRIGGER_PX);
});

test("draws the breadcrumb's book name 32px tall as the desktop board does", async ({
  page,
}) => {
  test.skip(!isWide(page), "narrow screens open it from the title");
  await openBook(page);

  const crumb = await boxOf(
    page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("button", { name: "Jump to a book" }),
  );

  expect(crumb.height).toBe(DESKTOP_CRUMB_TRIGGER_PX);
});

test("names the breadcrumb's book by its title, then Jump to a book", async ({
  page,
}) => {
  test.skip(!isWide(page), "narrow screens open it from the title");
  await openBook(page);

  const crumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("button");

  await expect(crumb).toHaveAccessibleName(`${BOOK_TITLE}, Jump to a book`);
});

test("opens and closes the list with G", async ({ page }) => {
  await openBook(page);

  await page.keyboard.press("g");
  await expect(jumpList(page)).toBeVisible();
  await page.keyboard.press("g");

  await expect(jumpList(page)).toBeHidden();
});

test("opens the book picked from the list", async ({ page }) => {
  await openBook(page);
  const list = await openJumpList(page);

  await list.getByRole("link", { name: PICKED.title }).click();

  await expect(page).toHaveURL(new RegExp(`/read/${PICKED.id}$`));
});

test("greys out a book whose file is missing and says why", async ({
  page,
}) => {
  await openBook(page);
  const list = await openJumpList(page);

  const missing = list.getByRole("listitem").filter({
    hasText: MISSING.title,
  });

  await expect(missing).toContainText("File missing: moved or deleted");
  await expect(missing.getByRole("link")).toHaveCount(0);
});

test("shows only the unread or bookmarked books when asked", async ({
  page,
}) => {
  await openBook(page);
  const list = await openJumpList(page);

  await list.getByRole("radio", { name: "Bookmarked" }).click();

  await expect(list.getByRole("listitem")).toHaveCount(1);
  await list.getByRole("radio", { name: "Unread" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(7);
});

test("keeps the shown books' segments as wide as they were as the choice changes", async ({
  page,
}) => {
  await openBook(page);
  const list = await openJumpList(page);
  const segments = list.getByRole("radio");
  const spansOf = async () =>
    (await Promise.all((await segments.all()).map(boxOf))).map(
      ({ x, width }) => ({ x, width }),
    );

  const segmentsBefore = await spansOf();
  for (const name of ["Bookmarked", "Unread", "All"]) {
    const segment = list.getByRole("radio", { name });
    await segment.click();
    await expect(segment).toBeChecked();
    expect(await spansOf()).toEqual(segmentsBefore);
  }
});

test("closes the list with Escape before leaving the book", async ({
  page,
}) => {
  test.skip(!isWide(page), "phones close the drawer like any sheet");
  await openBook(page);
  await openJumpList(page);

  await page.keyboard.press("Escape");

  await expect(jumpList(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
});

test("lists Jump to a book among the keyboard shortcuts", async ({ page }) => {
  await openBook(page);

  await page.keyboard.press("Shift+?");

  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toContainText("Jump to a book, or close it");
  await expect(sheet).toContainText("letter keys such as G type");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the list has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await openJumpList(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

for (const platform of ["android", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...shelfOf(EIGHT_BOOKS),
        appInfo: () => fakeAppInfo(platform),
      },
    });
    testOnlyInItsWebview(platform);

    test("sets every book's title in medium type, as the boards do", async ({
      page,
    }) => {
      await openBook(page);

      const list = await openJumpList(page);

      for (const book of EIGHT_BOOKS) {
        await expect(list.getByText(book.title, { exact: true })).toHaveCSS(
          "font-weight",
          "500",
        );
      }
    });
  });
}

test.describe("after picking a book", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...shelfOf(EIGHT_BOOKS),
      openBook: (id) => {
        const picked = EIGHT_BOOKS.find((book) => book.id === id);
        const opened = readerBook(
          id === PICKED.id
            ? { reading: { state: "started", page: 14 }, startPage: 13 }
            : NOT_STARTED,
        );
        return { ...opened, id, title: picked?.title ?? BOOK_TITLE };
      },
    },
  });

  function toast(page: Page, opening: string): Locator {
    return page
      .getByRole("region", { name: "Notifications F6" })
      .getByRole("listitem")
      .filter({ hasText: opening });
  }

  test("says it's back on the book's saved page, naming the book, with Start over", async ({
    page,
    platform,
  }) => {
    await openBook(page);
    const list = await openJumpList(page);

    await list.getByRole("link", { name: PICKED.title }).click();

    const shown = toast(page, `Back on page 14 of ${String(PAGES)}`);
    if (platform === "ios" || platform === "android") {
      await expect(
        page.getByRole("img", { name: "Page 14", exact: true }),
      ).toBeVisible();
      await expect(shown).toHaveCount(0);
      return;
    }
    await expect(shown).toContainText(PICKED.title);
    await expect(
      shown.getByRole("button", { name: "Start over" }),
    ).toBeVisible();
  });

  test("says it's starting a book never opened, with nothing to start over", async ({
    page,
  }) => {
    await openBook(page);
    const list = await openJumpList(page);
    await list.getByRole("link", { name: UNREAD.title }).click();

    const shown = toast(page, `Starting ${UNREAD.title}`);
    await expect(shown).toContainText(`Page 1 of ${String(PAGES)}`);
    await expect(shown.getByRole("button", { name: "Start over" })).toHaveCount(
      0,
    );
  });
});

test.describe("a long series", () => {
  const books = Array.from({ length: 24 }, (_, index) =>
    bookAt(
      index,
      index === 1 ? { reading: { state: "started", page: 1 } } : {},
    ),
  );

  test.use({ backend: shelfOf(books) });

  test("offers Find a book, and keeps G typing in it", async ({ page }) => {
    await openBook(page);
    const list = await openJumpList(page);
    const find = list.getByRole("searchbox", { name: "Find a book" });

    await find.fill("v2");
    await find.press("g");

    await expect(find).toHaveValue("v2g");
    await expect(jumpList(page)).toBeVisible();
    await find.fill("v2");
    await expect(list.getByRole("listitem")).toHaveCount(5);
  });

  test("clears Find a book with Escape before closing", async ({ page }) => {
    test.skip(!isWide(page), "phones close the drawer like any sheet");
    await openBook(page);
    const list = await openJumpList(page);
    const find = list.getByRole("searchbox", { name: "Find a book" });
    await find.fill("v2");

    await find.press("Escape");

    await expect(find).toHaveValue("");
    await expect(jumpList(page)).toBeVisible();
    await find.press("Escape");
    await expect(jumpList(page)).toBeHidden();
  });
});

test.describe("on an iPhone with a long series name", () => {
  const LONG_SERIES_TITLE =
    "Sample_Series_Scanned_From_The_Collectors_Edition_Box_Set_Volumes_01_To_24";

  test.use({
    backend: {
      ...shelfOf(EIGHT_BOOKS),
      appInfo: () => fakeAppInfo("ios"),
      openBook: () => ({
        ...readerBook(NOT_STARTED),
        seriesTitle: LONG_SERIES_TITLE,
      }),
    },
  });
  testOnlyInItsWebview("ios");

  test("leaves the title room to tap beside a back link capped as the board caps it", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "phones squeeze the title",
    );
    await openBook(page);
    const header = page.locator("main > header");

    const title = await boxOf(jumpTrigger(page));
    const back = await boxOf(
      header.getByRole("link", { name: `Back to ${LONG_SERIES_TITLE}` }),
    );

    expect(title.width).toBeGreaterThanOrEqual(IOS_TOUCH_TARGET_PX);
    expect(title.height).toBeGreaterThanOrEqual(IOS_TOUCH_TARGET_PX);
    expect(back.width).toBeLessThanOrEqual(IOS_NAMED_BACK_MAX_PX);
  });
});
