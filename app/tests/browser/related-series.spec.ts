import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { accessibilityViolations, expect, test } from "./fixtures.ts";
import { settleBarTitle } from "./series-bar.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;

const RELATED = [
  {
    id: "0190a3e4-0000-8000-8000-0000000000a7",
    title: "Sample Series 07",
    cover: null,
    bookCount: 5,
    readCount: 3,
    reason: { kind: "sameWriter" },
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000a6",
    title: "Sample Series 06",
    cover: null,
    bookCount: 8,
    readCount: 1,
    reason: { kind: "sharedTag", tag: "Slice of life" },
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000a1",
    title: "Sample Series 01",
    cover: null,
    bookCount: 12,
    readCount: 0,
    reason: { kind: "sameArtist" },
  },
] as const;

function backendWith(
  related: readonly (typeof RELATED)[number][],
): FakeBackend {
  const shelf = new FakeShelf([READ, NOT_STARTED], {
    related: related.map((series) => ({
      ...series,
      reason: { ...series.reason },
    })),
  });
  return shelf.backend();
}

function section(page: Page): Locator {
  return page.getByRole("region", { name: "Also in your library" });
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

test.describe("a series with others like it", () => {
  test.use({ backend: backendWith(RELATED) });

  test("lists each with why it's there and how far it's read", async ({
    page,
  }) => {
    await openSeries(page);
    const items = section(page).getByRole("listitem");

    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Sample Series 07");
    await expect(items.nth(0)).toContainText("Same writer");
    await expect(items.nth(0)).toContainText("60% read");
    await expect(items.nth(1)).toContainText("Slice of life");
    await expect(items.nth(1)).toContainText("12% read");
    await expect(items.nth(2)).toContainText("Same artist");
    await expect(items.nth(2)).toContainText("Not started");
  });

  test("opens a related series", async ({ page }) => {
    await openSeries(page);

    await section(page)
      .getByRole("link", { name: /Sample Series 07/ })
      .click();

    await expect(page).toHaveURL(new RegExp(`/series/${RELATED[0].id}$`));
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openSeries(page);
      await section(page).scrollIntoViewIfNeeded();
      await settleBarTitle(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a series with nothing like it in the library", () => {
  test.use({ backend: backendWith([]) });

  test("leaves the section out", async ({ page }) => {
    await openSeries(page);

    await expect(section(page)).toHaveCount(0);
  });
});
