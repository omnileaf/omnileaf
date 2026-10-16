import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const SECONDS_PER_PAGE = 15;
const STARTED_ON_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;

function backendTiming(secondsPerPage: number | null): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND, STARTED_ON_14),
    openBook: () => ({ ...readerBook(STARTED_ON_14), secondsPerPage }),
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
  });
  await servePages(page);
});

test.describe("once the library times reading", () => {
  test.use({ backend: backendTiming(SECONDS_PER_PAGE) });

  test("says about how long the rest of the chapter takes", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();

    await expect(
      page.getByText("About 4 min left in this chapter"),
    ).toBeAttached();
    await page.keyboard.press("End");

    await expect(
      page.getByText("Less than a minute left in this chapter"),
    ).toBeAttached();
  });
});

test.describe("before the library times reading", () => {
  test.use({ backend: backendTiming(null) });

  test("says nothing of the time left", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();

    await expect(page.getByText(/left in this chapter/)).toHaveCount(0);
  });
});
