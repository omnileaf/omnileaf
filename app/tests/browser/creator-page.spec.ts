import type { Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const CREATOR = "Author A";
const THEIR_SERIES = [
  {
    id: SERIES_ID,
    title: SERIES_TITLE,
    cover: null,
    role: "storyAndArt",
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000b1",
    title: "Sample Series 07",
    cover: null,
    role: "story",
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000b2",
    title: "Sample Series 01",
    cover: null,
    role: null,
  },
] as const;

function backendWith(found: typeof THEIR_SERIES | readonly []): FakeBackend {
  return {
    ...new FakeShelf([READ], {
      creators: [
        { name: CREATOR, role: "storyAndArt", seriesCount: 3 },
        { name: "Author C", role: "art", seriesCount: 1 },
      ],
    }).backend(),
    creatorSeries: (creator) =>
      creator === CREATOR ? found.map((series) => ({ ...series })) : [],
  };
}

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

async function openCreatorFromSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "About this series" })
    .getByRole("link", { name: CREATOR })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: CREATOR }),
  ).toBeVisible();
}

test.describe("a creator with series in the library", () => {
  test.use({ backend: backendWith(THEIR_SERIES) });

  test("links a creator with other series, and leaves one with only this series as text", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const details = page.getByRole("region", { name: "About this series" });

    await expect(
      details.getByRole("link", { name: CREATOR }).first(),
    ).toBeVisible();
    await expect(details.getByRole("link", { name: "Author C" })).toHaveCount(
      0,
    );
  });

  test("lists their series with what they did on each", async ({ page }) => {
    await openCreatorFromSeries(page);
    const items = page
      .getByRole("list", { name: `Series by ${CREATOR}` })
      .getByRole("listitem");

    await expect(page.getByText("3 series in your library")).toBeVisible();
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Story and art");
    await expect(items.nth(1)).toContainText("Story");
    await expect(items.nth(2)).toHaveText("Sample Series 01");
  });

  test("goes back to the series it was opened from", async ({ page }) => {
    await openCreatorFromSeries(page);

    await (
      isWide(page)
        ? page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: SERIES_TITLE })
        : page.getByRole("link", { name: `Back to ${SERIES_TITLE}` })
    ).click();

    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openCreatorFromSeries(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a creator whose series have gone", () => {
  test.use({ backend: backendWith([]) });

  test("says none of their series is left and leads back to the library", async ({
    page,
  }) => {
    await openCreatorFromSeries(page);

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: `No series by ${CREATOR} in your library`,
      }),
    ).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("link", { name: "Back to the library" })
      .last()
      .click();

    await expect(page).toHaveURL(/\/$/);
  });
});
