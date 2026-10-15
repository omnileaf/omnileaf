import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  readerBook,
  servePages,
} from "./reader-book.ts";

const READ_SECONDS = 72 * 60;
const SWIPE_PX = 120;
const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
const NEXT_BOOK_PAGE = new RegExp(`/read/${NEXT_BOOK.id}$`);
const FINISHED = `${BOOK_TITLE} finished`;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    bookReadTime: () => READ_SECONDS,
  },
});

test.beforeEach(async ({ page }) => {
  await servePages(page);
});

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openBook(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function upNext(page: Page): Locator {
  return page.getByRole("heading", { level: 2, name: FINISHED });
}

async function turnPastTheEnd(page: Page): Promise<void> {
  await page.keyboard.press("End");
  await expect(
    page.getByRole("img", { name: `Page ${String(PAGE_COUNT)}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(upNext(page)).toBeVisible();
}

function skipSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Skip this screen" });
}

async function swipeAcross(page: Page, across: number): Promise<void> {
  const surface = page.getByRole("button", { name: "Next page" }).locator("..");
  const box = await boxOf(surface);
  const pointer = {
    pointerType: "touch",
    isPrimary: true,
    clientY: box.y + box.height / 2,
  };
  const x = box.x + box.width / 2;
  await surface.dispatchEvent("pointerdown", { ...pointer, clientX: x });
  await surface.dispatchEvent("pointerup", { ...pointer, clientX: x + across });
}

test("shows up next on turning past the last page, the book marked read with the time spent on it", async ({
  page,
}) => {
  await openBook(page);

  await turnPastTheEnd(page);

  await expect(
    page.getByText(
      isWide(page)
        ? "Marked as read · 1 h 12 min"
        : `${BOOK_SERIES_TITLE} · marked as read · 1 h 12 min`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(NEXT_BOOK.title, { exact: true })).toBeVisible();
  await expect(page.getByText("Unread", { exact: true })).toBeVisible();
  await expect(skipSwitch(page)).not.toBeChecked();
});

const TURNS_AGAIN = [
  {
    way: "a tap on the next page's side",
    turn: (page: Page) =>
      page
        .getByRole("button", { name: "Next page" })
        .click({ position: { x: 8, y: 8 } }),
  },
  {
    way: "a swipe",
    turn: (page: Page) => swipeAcross(page, -SWIPE_PX),
  },
  {
    way: "the right arrow",
    turn: (page: Page) => page.keyboard.press("ArrowRight"),
  },
  { way: "Space", turn: (page: Page) => page.keyboard.press("Space") },
  {
    way: "its Read button",
    turn: (page: Page) =>
      page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` }).click(),
  },
];

for (const { way, turn } of TURNS_AGAIN) {
  test(`starts the next book from up next with ${way}`, async ({ page }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await turn(page);

    await expect(page).toHaveURL(NEXT_BOOK_PAGE);
  });
}

test("names the series and the book finished in a breadcrumb on desktops", async ({
  page,
}) => {
  await openBook(page);
  test.skip(!isWide(page), "phones show only the way back");

  await turnPastTheEnd(page);

  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
    new RegExp(`${BOOK_SERIES_TITLE}.*${BOOK_TITLE}`),
  );
});

test("hints Esc on its Back to the series button on a desktop", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  const back = page.getByRole("link", { name: "Back to the series" });

  await expect(back.locator("kbd")).toHaveText("Esc");
  await expect(back.locator("kbd")).toBeVisible();
});

test("hints the → key on its Read button on a desktop", async ({ page }) => {
  await openBook(page);
  await turnPastTheEnd(page);

  const read = page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` });

  await expect(read.locator("kbd")).toHaveText("→");
  await expect(read.locator("kbd")).toBeVisible();
  await expect(read).toHaveAccessibleName(`Read ${NEXT_BOOK.title}`);
});

test.describe("on a phone", () => {
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      bookReadTime: () => READ_SECONDS,
    },
  });

  test("leaves the → key off its Read button", async ({ page }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    const read = page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` });

    await expect(read).toBeVisible();
    await expect(read.locator("kbd")).toBeHidden();
  });
});

test.describe("a next book whose pages are counted", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({
        ...readerBook(NOT_STARTED),
        id,
        next: { ...NEXT_BOOK, pageCount: 184 },
      }),
      bookReadTime: () => READ_SECONDS,
    },
  });

  test("names how many pages it has and how far it was read", async ({
    page,
  }) => {
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(page.getByText("184 pages · unread")).toBeVisible();
  });
});

test.describe("a book read right to left", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({
        ...readerBook(NOT_STARTED),
        id,
        readingDirection: "rightToLeft",
      }),
      bookReadTime: () => READ_SECONDS,
    },
  });

  test("hints the ← key on its Read button", async ({ page }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await expect(
      page.getByRole("img", {
        name: `Page ${String(PAGE_COUNT)}`,
        exact: true,
      }),
    ).toBeVisible();

    await page.keyboard.press("ArrowLeft");

    await expect(
      page
        .getByRole("link", { name: `Read ${NEXT_BOOK.title}` })
        .locator("kbd"),
    ).toHaveText("←");
  });
});

test("goes back to the last page on turning back from up next", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await page.keyboard.press("ArrowLeft");

  await expect(upNext(page)).toBeHidden();
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(PAGE_COUNT)} of ${String(PAGE_COUNT)}`,
  );
});

test("goes back to the series from up next with Escape", async ({ page }) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(SERIES_PAGE);
});

for (const name of [`Back to ${BOOK_SERIES_TITLE}`, "Back to the series"]) {
  test(`goes back to the series from up next's ${name} link`, async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await page.getByRole("main").getByRole("link", { name }).click();

    await expect(page).toHaveURL(SERIES_PAGE);
  });
}

test("turns Skip Up next on in Settings › Reading from up next's switch", async ({
  page,
}) => {
  await openBook(page);
  await turnPastTheEnd(page);

  await skipSwitch(page).click();
  await expect(skipSwitch(page)).toBeChecked();
  await page.goto("/settings/reading");

  await expect(
    page.getByRole("switch", { name: "Skip Up next" }),
  ).toBeChecked();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`up next has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openBook(page);
    await turnPastTheEnd(page);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("with Skip Up next on", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.skipUpNext", "on");
    });
  });

  test("goes straight on to the next book, naming it in a toast", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");

    await expect(page).toHaveURL(NEXT_BOOK_PAGE);
    await expect(
      page.getByText(`Now reading ${NEXT_BOOK.title}`),
    ).toBeVisible();
  });

  test("goes back to the last page of the book finished with the toast's Undo", async ({
    page,
  }) => {
    await openBook(page);
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(NEXT_BOOK_PAGE);

    await page.getByRole("button", { name: "Undo" }).click();

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
    await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
      "aria-valuetext",
      `Page ${String(PAGE_COUNT)} of ${String(PAGE_COUNT)}`,
    );
  });
});

test.describe("the last book of a series", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => ({ ...readerBook(NOT_STARTED), next: null }),
      bookReadTime: () => READ_SECONDS,
    },
  });

  test("says every book is read and leads back to the series or the library", async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);
    await expect(page.getByText("Up next")).toBeHidden();
    await expect(
      page.getByText("You've read every book in this series"),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Back to the library" }),
    ).toHaveAttribute("href", "/");

    await page
      .getByRole("main")
      .getByRole("link", { name: "Back to the series" })
      .click();

    await expect(page).toHaveURL(SERIES_PAGE);
  });

  test("goes back to the series on turning the page again", async ({
    page,
  }) => {
    await openBook(page);
    await turnPastTheEnd(page);

    await page.keyboard.press("ArrowRight");

    await expect(page).toHaveURL(SERIES_PAGE);
  });

  test("shows up next even with Skip Up next on, as there's no book to go on to", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.skipUpNext", "on");
    });
    await openBook(page);

    await turnPastTheEnd(page);

    await expect(upNext(page)).toBeVisible();
  });
});
