import type { Locator, Page } from "@playwright/test";

import type { AdultTreatment } from "../../src/lib/ipc/bindings.ts";
import { NEW_ADULT_CONTENT } from "../../src/lib/library/adult-content.ts";
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
    isAdult: true,
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000a6",
    title: "Sample Series 06",
    cover: null,
    bookCount: 8,
    readCount: 1,
    reason: { kind: "sharedTag", tag: "Slice of life" },
    isAdult: false,
  },
  {
    id: "0190a3e4-0000-8000-8000-0000000000a1",
    title: "Sample Series 01",
    cover: null,
    bookCount: 12,
    readCount: 0,
    reason: { kind: "sameArtist" },
    isAdult: false,
  },
] as const;

const ADULT_TITLE = "Sample Series 07";

function backendWith(
  related: readonly (typeof RELATED)[number][],
  treatment: AdultTreatment = "show",
): FakeBackend {
  const shelf = new FakeShelf([READ, NOT_STARTED], {
    related: related.map((series) => ({
      ...series,
      reason: { ...series.reason },
    })),
  });
  return {
    ...shelf.backend(),
    libraryAdultContent: () => ({ ...NEW_ADULT_CONTENT, treatment }),
  };
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

test.describe("a series with an 18+ series like it, while 18+ covers are blurred", () => {
  test.use({ backend: backendWith(RELATED, "blur") });

  function showCover(page: Page): Locator {
    return section(page).getByRole("button", {
      name: `Show the cover of ${ADULT_TITLE}`,
    });
  }

  test("blurs the 18+ series until it's shown, then shows it in place", async ({
    page,
  }) => {
    await openSeries(page);
    await expect(showCover(page)).toContainText("18+");

    await showCover(page).click();

    await expect(showCover(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
    await expect(
      section(page).getByRole("link", { name: new RegExp(ADULT_TITLE) }),
    ).toBeVisible();
  });

  test("says how to show it, as the library does", async ({
    page,
  }, testInfo) => {
    await openSeries(page);

    await expect(showCover(page)).toContainText(
      testInfo.project.use.hasTouch === true ? "Tap to show" : "Click to show",
    );
  });
});

test.describe("a series with an 18+ series like it, while 18+ content is hidden", () => {
  test.use({ backend: backendWith(RELATED, "hide") });

  test("leaves the 18+ series out", async ({ page }) => {
    await openSeries(page);
    const items = section(page).getByRole("listitem");

    await expect(items).toHaveCount(2);
    await expect(section(page)).not.toContainText(ADULT_TITLE);
  });
});

test.describe("a series with only 18+ series like it, while 18+ content is hidden", () => {
  test.use({ backend: backendWith([RELATED[0]], "hide") });

  test("leaves the section out", async ({ page }) => {
    await openSeries(page);

    await expect(section(page)).toHaveCount(0);
  });
});

test.describe("a series with others like it while Screenshot mode is on", () => {
  test.use({ backend: backendWith(RELATED) });

  test("leaves 18+ series out and says only that a tag is shared", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "omnileaf.screenshotMode",
        JSON.stringify({ activity: { kind: "on" } }),
      );
    });
    await page.goto(`/series/${SERIES_ID}`);
    const items = section(page).getByRole("listitem");

    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Same tag");
    await expect(items.nth(1)).toContainText("Same artist");
    const shown = (await section(page).textContent()) ?? "";
    for (const own of ["Sample Series", "Slice of life"]) {
      expect(shown).not.toContain(own);
    }
  });
});

test.describe("a series with nothing like it in the library", () => {
  test.use({ backend: backendWith([]) });

  test("leaves the section out", async ({ page }) => {
    await openSeries(page);

    await expect(section(page)).toHaveCount(0);
  });
});
