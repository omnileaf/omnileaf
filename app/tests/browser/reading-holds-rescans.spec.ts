import { CommandFailure } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { BOOK_ID, NOT_STARTED, readerBook, servePages } from "./reader-book.ts";

const told: boolean[] = [];

function telling(
  openBook: (typeof DEFAULT_BACKEND)["openBook"],
): typeof DEFAULT_BACKEND {
  return {
    ...DEFAULT_BACKEND,
    openBook,
    setBookOpen: (isOpen) => {
      told.push(isOpen);
    },
  };
}

test.beforeEach(() => {
  told.length = 0;
});

test.describe("a book the reader shows", () => {
  test.use({
    backend: telling((id) => ({ ...readerBook(NOT_STARTED), id })),
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
});

test.describe("a book the library doesn't hold", () => {
  test.use({
    backend: telling(() => {
      throw new CommandFailure({
        code: "bookNotFound",
        message: "the book didn't open",
      });
    }),
  });

  test("leaves scheduled rescans running while the reader shows why it can't open", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book isn't in your library" }),
    ).toBeVisible();
    await expect.poll(() => told.length).toBeGreaterThan(0);
    expect(told).not.toContain(true);
  });
});
