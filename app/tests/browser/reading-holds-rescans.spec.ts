import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { BOOK_ID, NOT_STARTED, readerBook, servePages } from "./reader-book.ts";

const told: boolean[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    setBookOpen: (isOpen) => {
      told.push(isOpen);
    },
  },
});

test.beforeEach(() => {
  told.length = 0;
});

test("tells the library a book is open while the reader shows and closed once it leaves", async ({
  page,
}) => {
  await servePages(page);
  await page.goto("/");
  await expect.poll(() => told.at(-1)).toBe(false);

  await page.goto(`/read/${BOOK_ID}`);
  await expect.poll(() => told.at(-1)).toBe(true);
  await page.keyboard.press("Escape");

  await expect.poll(() => told.at(-1)).toBe(false);
});
