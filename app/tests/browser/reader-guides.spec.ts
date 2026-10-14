import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const ON_PAGE_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function toast(page: Page, opening: string) {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: opening });
}

function guide(page: Page) {
  return page.getByRole("note", { name: /to turn pages$/ });
}

test.describe("a book opened for the first time", () => {
  test.use({ hasSeenReaderGuide: false });

  test("shows how to turn pages once, until Got it", async ({ page }) => {
    await openBook(page);

    await expect(guide(page)).toBeVisible();
    await guide(page).getByRole("button", { name: "Got it" }).click();
    await expect(guide(page)).toBeHidden();
    await page.reload();

    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();
    await expect(guide(page)).toBeHidden();
  });

  test("says tap on phones and click on desktops", async ({ page }) => {
    await openBook(page);

    await expect(guide(page)).toHaveAccessibleName(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH &&
        test.info().project.use.isMobile !== true
        ? "Click to turn pages"
        : /(Tap|Click) to turn pages/,
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the guide has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openBook(page);
      await expect(guide(page)).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a book opened partway through", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => readerBook(ON_PAGE_14),
    },
  });

  test("says it's back on the saved page and offers to start over", async ({
    page,
  }) => {
    await openBook(page);
    const status = toast(page, `Back on page 14 of ${String(PAGE_COUNT)}`);

    await expect(status).toBeVisible();
    await status.getByRole("button", { name: "Start over" }).click();

    await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
      "aria-valuetext",
      `Page 1 of ${String(PAGE_COUNT)}`,
    );
  });
});

test.describe("a book opened at its start", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => readerBook(NOT_STARTED),
    },
  });

  test("says nothing about where it opened", async ({ page }) => {
    await openBook(page);

    await expect(page.getByText(/^Back on page/)).toHaveCount(0);
  });
});

test.describe("a book its details say reads right to left", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      openBook: () => ({
        ...readerBook(NOT_STARTED),
        readingDirection: "rightToLeft",
      }),
    },
  });

  test("says so once for the series, with a way to change it", async ({
    page,
  }) => {
    await openBook(page);
    const status = toast(page, "Reading right to left");

    await expect(status).toContainText("Found in its details");
    await expect(status.getByRole("button", { name: "Change" })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
    ).toBeAttached();
    await expect(toast(page, "Reading right to left")).toHaveCount(0);
  });
});

test.describe("full screen", () => {
  let isFullScreen = false;

  test.beforeEach(() => {
    isFullScreen = false;
  });

  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      changeFullScreen: (change) => {
        const was = isFullScreen;
        isFullScreen = change === "toggle" && !was;
        return was;
      },
    },
  });

  test("says how to leave on going full screen", async ({ page }) => {
    await openBook(page);

    await page.keyboard.press("f");

    await expect(toast(page, "Press F or Esc to leave.")).toBeVisible();
  });
});
