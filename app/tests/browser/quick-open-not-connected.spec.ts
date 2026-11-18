import type { Locator, Page } from "@playwright/test";

import type {
  HistoryEntry,
  MissingFolder,
} from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const STARTED_AT_MS = 1_790_000_000_000;
const AWAY_BOOK = "0190a3e4-0000-8000-8000-0000000000b1";

const AWAY_ENTRY = {
  book: AWAY_BOOK,
  bookTitle: "Volume 3",
  series: "0190a3e4-0000-8000-8000-000000000004",
  seriesTitle: "Sample Series 0004",
  position: 3,
  cover: null,
  startedAtMs: STARTED_AT_MS,
  utcOffsetMinutes: 0,
  readSeconds: 600,
  readTo: { state: "page", page: 37, pageCount: 192 },
  reading: { state: "started", page: 37 },
  day: { day: Math.floor(STARTED_AT_MS / 86_400_000), readSeconds: 600 },
} as HistoryEntry;

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

let asked: string[] = [];

test.use({
  viewport: { width: MEDIUM_MIN_WIDTH + 300, height: 900 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    missingLibraryFolders: () => [FOLDER],
    readingHistory: (_after, of) => ({
      entries: of.kind === "unfinished" ? [AWAY_ENTRY] : [],
      next: null,
    }),
    bookMissingFolder: (book) => (book === AWAY_BOOK ? FOLDER : null),
    relocateLibraryFolder: (id) => {
      asked.push(`relocate ${id}`);
      return null;
    },
  },
});

function quickOpen(page: Page): Locator {
  return page.getByRole("dialog", { name: "Quick open" });
}

async function openQuickOpen(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await page.keyboard.press("Control+k");
  await expect(quickOpen(page)).toBeVisible();
}

test.describe(
  "quick open on an Android tablet while a folder is away",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Not connected look");
      asked = [];
    });

    test("keeps a book that isn't connected in Continue reading, tagged, and says Enter finds the folder", async ({
      page,
    }) => {
      await openQuickOpen(page);

      const continuing = quickOpen(page).getByRole("group", {
        name: "Continue reading",
      });

      await expect(continuing.getByText("Not connected")).toBeVisible();
      await expect(continuing).toContainText("Finds the folder");
    });

    test("finds the folder with Enter instead of opening the reader", async ({
      page,
    }) => {
      await openQuickOpen(page);
      await expect(
        quickOpen(page).getByRole("group", { name: "Continue reading" }),
      ).toContainText("Finds the folder");

      await page.keyboard.press("Enter");

      await expect.poll(() => asked).toEqual([`relocate ${FOLDER.folder.id}`]);
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("offers Find the folder among the actions", async ({ page }) => {
      await openQuickOpen(page);

      const actions = quickOpen(page).getByRole("group", { name: "Actions" });
      await actions.getByRole("option", { name: /Find the folder/ }).click();

      await expect.poll(() => asked).toEqual([`relocate ${FOLDER.folder.id}`]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openQuickOpen(page);
        await expect(
          quickOpen(page).getByRole("group", { name: "Continue reading" }),
        ).toContainText("Not connected");

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);
