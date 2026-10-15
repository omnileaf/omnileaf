import type { Page } from "@playwright/test";

import type { HistoryEntry } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  readerBook,
  servePages,
} from "./reader-book.ts";

const STARTED_AT_MS = 1_790_000_000_000;

const LAST_BOOK = {
  book: BOOK_ID,
  bookTitle: BOOK_TITLE,
  series: "0190a3e4-0000-8000-8001-000000000001",
  seriesTitle: "Sample Series 01",
  position: 1,
  cover: null,
  startedAtMs: STARTED_AT_MS,
  utcOffsetMinutes: 0,
  readSeconds: 600,
  readTo: { state: "page", page: 14, pageCount: 30 },
  reading: { state: "started", page: 14 },
  day: { day: Math.floor(STARTED_AT_MS / 86_400_000), readSeconds: 600 },
} as HistoryEntry;

function backendWith(unfinished: readonly HistoryEntry[]): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    readingHistory: (_after, of) => ({
      entries: of.kind === "unfinished" ? [...unfinished] : [],
      next: null,
    }),
  };
}

async function opensOn(page: Page, place: string): Promise<void> {
  await page.addInitScript((stored) => {
    localStorage.setItem("omnileaf.opensOn", stored);
  }, place);
  await servePages(page);
}

test.describe("with a book left unfinished", () => {
  test.use({ backend: backendWith([LAST_BOOK]) });

  test("opens on the library until another place is chosen", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
  });

  test("opens on History once it's chosen, and lets the library open after", async ({
    page,
  }) => {
    await opensOn(page, "history");

    await page.goto("/");
    await expect(page).toHaveURL(/\/history$/);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Library" })
      .click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("opens the last book in the reader once Last book is chosen", async ({
    page,
  }) => {
    await opensOn(page, "lastBook");

    await page.goto("/");

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
  });
});

test.describe("with nothing left unfinished", () => {
  test.use({ backend: backendWith([]) });

  test("opens on the library when Last book has no book to open", async ({
    page,
  }) => {
    await opensOn(page, "lastBook");

    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
  });
});
