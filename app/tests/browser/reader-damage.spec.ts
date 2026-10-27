import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  testOnlyInItsWebview,
  viewportOf,
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

function badge(page: Page) {
  return page.locator('main [data-slot="empty-media"]');
}

function count(page: Page) {
  return page.getByText(
    `${String(PAGE_COUNT)} of its ${String(PROMISED_PAGES)} pages can be read.`,
  );
}

test.describe("a damaged book, on a phone", { tag: "@native" }, () => {
  test("starts its badge, title and count on Android and centres them on iOS, as each phone's problem screens do", async ({
    page,
    platform,
  }) => {
    test.skip(platform === undefined, "the native phone projects only");
    await openDamagedBook(page);
    await expect(heading(page)).toBeFocused();

    const expected = platform === "ios" ? "center" : "start";
    const shownBadge = await boxOf(badge(page));
    const title = await boxOf(heading(page));

    await expect(heading(page)).toHaveCSS("text-align", expected);
    await expect(count(page)).toHaveCSS("text-align", expected);
    expect(title.y).toBeGreaterThanOrEqual(shownBadge.y + shownBadge.height);
    const badgeEdge =
      expected === "start" ? shownBadge.x : shownBadge.x + shownBadge.width / 2;
    const titleEdge =
      expected === "start" ? title.x : title.x + title.width / 2;
    expect(badgeEdge).toBeCloseTo(titleEdge, 0);
  });
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`a damaged book, on ${platform} wider than a phone`, () => {
    testOnlyInItsWebview(platform);
    test.use({ platform });

    test("keeps its badge beside a title and count read from the start", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "wider than a phone only",
      );
      await openDamagedBook(page);
      await expect(heading(page)).toBeFocused();

      const shownBadge = await boxOf(badge(page));
      const title = await boxOf(heading(page));

      await expect(heading(page)).toHaveCSS("text-align", "start");
      await expect(count(page)).toHaveCSS("text-align", "start");
      expect(title.x).toBeGreaterThanOrEqual(shownBadge.x + shownBadge.width);
      expect(title.y + title.height / 2).toBeCloseTo(
        shownBadge.y + shownBadge.height / 2,
        0,
      );
    });
  });
}
