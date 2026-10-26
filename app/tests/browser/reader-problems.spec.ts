import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
} from "./reader-book.ts";

const PLACE = {
  id: BOOK_ID,
  title: BOOK_TITLE,
  series: BOOK_SERIES_ID,
  seriesTitle: BOOK_SERIES_TITLE,
};

function failingWith(
  code: "bookNotFound" | "bookUnreadable" | "internal",
  place: typeof PLACE | null,
): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    openBook: () => {
      throw new CommandFailure({ code, message: "the book didn't open" });
    },
    bookPlace: () => place,
  };
}

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function problem(page: Page): Locator {
  return page.getByRole("main");
}

test.describe("a book the library doesn't hold", () => {
  test.use({ backend: failingWith("bookNotFound", null) });

  test("says so and leads back to the library", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book isn't in your library" }),
    ).toBeFocused();
    await expect(problem(page)).toContainText(
      "It may have been removed, or the folder holding it taken out of the library.",
    );
    await expect(
      problem(page).getByRole("link", { name: "Back to the library" }),
    ).toHaveCount(2);
    await expect(
      problem(page).getByRole("link", { name: "Back to the library" }).last(),
    ).toHaveAttribute("href", "/");
  });
});

test.describe("a book whose file couldn't be opened", () => {
  test.use({ backend: failingWith("bookUnreadable", PLACE) });

  test("says so and leads back to its series", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "This book couldn't be opened" }),
    ).toBeFocused();
    await expect(
      problem(page).getByRole("link", { name: "Back to the series" }),
    ).toHaveAttribute("href", `/series/${BOOK_SERIES_ID}`);
    await expect(
      problem(page).getByRole("link", { name: `Back to ${BOOK_SERIES_TITLE}` }),
    ).toHaveAttribute("href", `/series/${BOOK_SERIES_ID}`);
  });

  test("names the series and the book in a breadcrumb on desktops", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);
    test.skip(!isWide(page), "phones show only the way back");

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveText(new RegExp(`${BOOK_SERIES_TITLE}.*${BOOK_TITLE}`));
  });

  test("says showing the file is still to come", async ({ page }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      problem(page).getByRole("button", {
        name: /^Show (the file|in folder) · coming soon$/,
      }),
    ).toBeDisabled();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/read/${BOOK_ID}`);
      await expect(
        page.getByRole("heading", { name: "This book couldn't be opened" }),
      ).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a book that failed to open for a reason of the app's own", () => {
  test.use({ backend: failingWith("internal", PLACE) });

  test("says something went wrong and leads back to its series", async ({
    page,
  }) => {
    await page.goto(`/read/${BOOK_ID}`);

    await expect(
      page.getByRole("heading", { name: "Something went wrong" }),
    ).toBeFocused();
    await expect(
      problem(page).getByRole("link", { name: "Back to the series" }),
    ).toBeVisible();
  });
});

const WAY_BACK_HEIGHT: Readonly<Partial<Record<string, number>>> = {
  ios: 50,
  android: 40,
};

test.describe(
  "a book that failed to open, on a phone",
  { tag: "@native" },
  () => {
    test.use({ backend: failingWith("internal", PLACE) });

    test("draws the way back as the platform's own button", async ({
      page,
      platform,
    }) => {
      await page.goto(`/read/${BOOK_ID}`);
      const wayBack = problem(page).getByRole("link", {
        name: "Back to the series",
      });

      await expect(wayBack).toBeVisible();
      const expected =
        platform === undefined ? undefined : WAY_BACK_HEIGHT[platform];
      if (expected !== undefined) {
        expect((await wayBack.boundingBox())?.height).toBeCloseTo(expected, 0);
      }
    });

    test("has no accessibility violations", async ({ page }) => {
      await page.goto(`/read/${BOOK_ID}`);
      await expect(
        page.getByRole("heading", { name: "Something went wrong" }),
      ).toBeFocused();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  },
);

const BACK_ICONS: Readonly<Partial<Record<string, string>>> = {
  ios: "chevron-left",
  android: "arrow-left",
};

test.describe(
  "a problem screen's way back, on a phone",
  { tag: "@native" },
  () => {
    test.use({ backend: failingWith("internal", PLACE) });

    test("is the platform's own back button, with the series named only on Android", async ({
      page,
      platform,
    }) => {
      await page.goto(`/read/${BOOK_ID}`);
      const back = page
        .getByRole("navigation")
        .getByRole("link", { name: `Back to ${BOOK_SERIES_TITLE}` });
      const seriesName = page
        .getByRole("navigation")
        .getByText(BOOK_SERIES_TITLE, { exact: true })
        .first();

      await expect(back).toBeVisible();
      const icon = platform === undefined ? undefined : BACK_ICONS[platform];
      if (icon === undefined) {
        return;
      }
      await expect(back.locator(`[data-icon="${icon}"]`)).toHaveCount(1);
      const box = await back.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height).toBeCloseTo(box?.width ?? 0, 0);
      if (platform === "ios") {
        await expect(seriesName).toBeHidden();
      } else {
        await expect(seriesName).toBeVisible();
      }
    });
  },
);
