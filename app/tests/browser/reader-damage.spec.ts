import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const PROMISED_PAGES = PAGE_COUNT + 6;

test.use({
  backend: {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => ({
      ...readerBook(NOT_STARTED),
      damage: { promisedPages: PROMISED_PAGES, cause: "archiveEndsEarly" },
    }),
  },
});

async function openDamagedBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
}

function heading(page: Page) {
  return page.getByRole("heading", {
    level: 1,
    name: `Part of ${BOOK_TITLE} is damaged`,
  });
}

test("says how many pages can be read and why the rest can't, before reading", async ({
  page,
}) => {
  await openDamagedBook(page);

  await expect(heading(page)).toBeFocused();
  await expect(
    page.getByText(
      `${String(PAGE_COUNT)} of its ${String(PROMISED_PAGES)} pages can be read.`,
    ),
  ).toBeVisible();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText(
    `Pages ${String(PAGE_COUNT + 1)}–${String(PROMISED_PAGES)}: the archive ends early`,
  );
  await expect(alert).toContainText(
    "The file may not have finished copying. Copy it again to get every page. Nothing else in your library has changed.",
  );
  await expect(page.getByRole("link", { name: /^Back to / })).toHaveAttribute(
    "href",
    `/series/${BOOK_SERIES_ID}`,
  );
});

test("reads the pages that work", async ({ page }) => {
  await openDamagedBook(page);

  await page
    .getByRole("button", {
      name: `Read the ${String(PAGE_COUNT)} pages that work`,
    })
    .click();

  await expect(heading(page)).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page 1 of ${String(PAGE_COUNT)}`,
  );
});

test("says showing the file is still to come", async ({ page }) => {
  await openDamagedBook(page);

  await expect(
    page.getByRole("button", {
      name: /^Show (the file|in folder) · coming soon$/,
    }),
  ).toBeDisabled();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openDamagedBook(page);
    await expect(heading(page)).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("a damaged book, on a phone", { tag: "@native" }, () => {
  test("centres its badge, title and count, as the phone's problem screens do", async ({
    page,
    platform,
  }) => {
    await openDamagedBook(page);
    await expect(heading(page)).toBeFocused();

    const expected =
      platform === "ios" || platform === "android" ? "center" : "start";
    const count = page.getByText(
      `${String(PAGE_COUNT)} of its ${String(PROMISED_PAGES)} pages can be read.`,
    );

    await expect(heading(page)).toHaveCSS("text-align", expected);
    await expect(count).toHaveCSS("text-align", expected);
  });
});
