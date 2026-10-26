import type { Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  fakeAppInfo,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
const BACK_TO_SERIES = `Back to ${BOOK_SERIES_TITLE}`;

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

test("goes back to the series with Alt and the left arrow", async ({
  page,
}) => {
  await openBook(page);

  await page.keyboard.press("Alt+ArrowLeft");

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("goes back to the series with the mouse's back button", async ({
  page,
}) => {
  await openBook(page);

  await page
    .getByRole("main")
    .dispatchEvent("mouseup", { button: 3, buttons: 0 });

  await expect(page).toHaveURL(SERIES_PAGE);
});

test("names the series and its keys in the back button's tooltip on desktops", async ({
  page,
}) => {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH,
    "phones have no keys to name",
  );
  await openBook(page);

  await page
    .locator("main > header")
    .getByRole("link", { name: BACK_TO_SERIES, exact: true })
    .hover();

  const tooltip = page.getByText(BACK_TO_SERIES, { exact: true }).locator("..");
  await expect(tooltip).toContainText("Esc");
  await expect(tooltip).toContainText("Alt ←");
});

test.describe("on macOS", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      appInfo: () => fakeAppInfo("macos"),
    },
  });

  test("goes back to the series with ⌘ [", async ({ page }) => {
    await openBook(page);

    await page.keyboard.press("Meta+BracketLeft");

    await expect(page).toHaveURL(SERIES_PAGE);
  });
});
