import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const AWAY_AT = 1;
const CATALOG = sampleSeries(2).map((series, index) =>
  index === AWAY_AT ? { ...series, isConnected: false } : series,
);
const AWAY_SERIES = CATALOG[AWAY_AT];
const THERE = CATALOG[0];
const AWAY_TITLE = AWAY_SERIES?.title ?? "";

const FOLDER: MissingFolder = {
  folder: {
    id: "0190a3e4-0000-7000-8000-0000000000f1" as MissingFolder["folder"]["id"],
    kind: "linked",
    name: "Comics",
    location: "/storage/1A2B-3C4D/Comics",
    isAvailable: false,
  },
  problem: { kind: "driveDisconnected" },
  hiddenSeries: 0,
  isShownAnyway: true,
};

const AWAY_CHAPTER = "Salt and Harbour Lights";
const CHAPTER_HITS = [
  {
    series: THERE?.id ?? "",
    seriesTitle: THERE?.title ?? "",
    book: "0190a3e4-0000-8000-8000-000000000101",
    position: 1,
    title: "The Harbour Gate at Night",
    matchedIn: "fileName" as const,
    file: { kind: "present" as const },
  },
  {
    series: AWAY_SERIES?.id ?? "",
    seriesTitle: AWAY_TITLE,
    book: "0190a3e4-0000-8000-8000-000000000102",
    position: 4,
    title: AWAY_CHAPTER,
    matchedIn: "fileName" as const,
    file: { kind: "notConnected" as const },
  },
];

let asked: string[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: CATALOG, next: null }),
    librarySearch: () => ({ series: CATALOG, next: null }),
    librarySearchCount: () => CATALOG.length,
    librarySearchChapters: () => ({
      hits: CHAPTER_HITS,
      next: null,
      count: CHAPTER_HITS.length,
    }),
    seriesMissingFolder: (id) => {
      asked.push(`series ${id}`);
      return FOLDER;
    },
    bookMissingFolder: (id) => {
      asked.push(`book ${id}`);
      return FOLDER;
    },
    relocateLibraryFolder: (id) => {
      asked.push(`relocate ${id}`);
      return null;
    },
  },
});

async function search(page: Page): Promise<void> {
  await page.goto("/search");
  await page
    .getByRole("main")
    .getByRole("combobox", { name: "Search your library" })
    .fill("harbour");
  await expect(page.getByRole("option")).toHaveCount(CATALOG.length);
}

function awaySeries(page: Page): Locator {
  return page.getByRole("option", { name: new RegExp(AWAY_TITLE) });
}

function notice(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

test.describe(
  "a series or chapter that isn't connected in an Android phone's search",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Not connected look");
      asked = [];
    });

    test("dims the cover to 45% and ends the last line with the Not connected tag", async ({
      page,
    }) => {
      await search(page);

      const away = awaySeries(page);

      await expect(away.getByText("Not connected")).toBeVisible();
      await expect(away.locator('[data-slot="list-cover"]')).toHaveCSS(
        "opacity",
        "0.45",
      );
    });

    test("says why instead of opening a series that isn't connected", async ({
      page,
    }) => {
      await search(page);

      await awaySeries(page).click();

      await expect(notice(page, `${AWAY_TITLE} isn’t connected`)).toContainText(
        "It can’t be opened until its folder or drive is back.",
      );
      expect(new URL(page.url()).pathname).toBe("/search");
    });

    test("finds the series' folder from the notice", async ({ page }) => {
      await search(page);
      await awaySeries(page).click();

      await notice(page, `${AWAY_TITLE} isn’t connected`)
        .getByRole("button", { name: "Find the folder" })
        .click();

      await expect
        .poll(() => asked)
        .toEqual([
          `series ${AWAY_SERIES?.id ?? ""}`,
          `relocate ${FOLDER.folder.id}`,
        ]);
    });

    test("finds a chapter's folder from the button that ends its row", async ({
      page,
    }) => {
      await search(page);

      await page
        .getByRole("button", { name: `Find the folder for ${AWAY_TITLE}` })
        .click();

      await expect
        .poll(() => asked)
        .toEqual([
          `book ${CHAPTER_HITS[1]?.book ?? ""}`,
          `relocate ${FOLDER.folder.id}`,
        ]);
    });

    test("says why instead of opening a chapter that isn't connected", async ({
      page,
    }) => {
      await search(page);

      await page
        .getByRole("button", { name: new RegExp(AWAY_CHAPTER) })
        .click();

      await expect(
        notice(page, `${AWAY_CHAPTER} isn’t connected`),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/search");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes the accessibility checks in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await search(page);
        await expect(awaySeries(page).getByText("Not connected")).toBeVisible();
        await expect(
          page.getByRole("button", { name: new RegExp(AWAY_CHAPTER) }),
        ).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);
