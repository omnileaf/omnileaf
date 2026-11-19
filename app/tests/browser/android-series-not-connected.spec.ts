import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const UNREAD = { state: "notStarted" } as const;

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
let missingAnswers: (MissingFolder | null)[] = [];

const SHELF = new FakeShelf([READ, READ, UNREAD, UNREAD]);
for (const book of SHELF.books) {
  book.file = { kind: "notConnected" };
}
const UP_NEXT = SHELF.titleOf(2);

function awayShelf(): FakeBackend {
  const shelf = SHELF.backend();
  return {
    ...shelf,
    seriesOverview: async (id) => ({
      ...(await shelf.seriesOverview(id)),
      connection: { kind: "notConnected" },
    }),
    seriesMissingFolder: (id) => {
      asked.push(`series ${id}`);
      return missingAnswers.length > 1
        ? (missingAnswers.shift() ?? null)
        : (missingAnswers[0] ?? null);
    },
    bookMissingFolder: (id) => {
      asked.push(`book ${id}`);
      return FOLDER;
    },
    rescanLibraryFolder: (id) => {
      asked.push(`rescan ${id}`);
      return {
        id,
        name: FOLDER.folder.name,
        outcome: { kind: "unreachable" },
      };
    },
    relocateLibraryFolder: (id) => {
      asked.push(`relocate ${id}`);
      return null;
    },
  };
}

test.use({ backend: awayShelf() });

function card(page: Page): Locator {
  return page
    .locator('[data-slot="alert"]')
    .filter({ hasText: `${SERIES_TITLE} isn’t connected` });
}

function notice(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) });
}

test.describe(
  "a series that isn't connected on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Not connected look");
      asked = [];
      missingAnswers = [FOLDER];
    });

    test("dims the cover, tags the count line and warns above Continue", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await expect(card(page)).toContainText(
        "Its folder or drive may be disconnected. You can still change its reading state and tags. Your reading progress is safe.",
      );
      await expect(
        page.getByRole("img", { name: `Cover of ${SERIES_TITLE}` }),
      ).toHaveCSS("opacity", "0.45");
      await expect(
        page.getByRole("region", { name: "About" }).getByText("Not connected"),
      ).toBeVisible();
    });

    test("finds the folder from the card", async ({ page }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await card(page).getByRole("button", { name: "Find the folder" }).click();

      await expect
        .poll(() => asked)
        .toEqual([`series ${SERIES_ID}`, `relocate ${FOLDER.folder.id}`]);
    });

    test("says it's still not connected when checking again finds the folder away", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await card(page).getByRole("button", { name: "Check again" }).click();

      await expect(notice(page, "Still not connected")).toBeVisible();
      expect(asked).toEqual([
        `series ${SERIES_ID}`,
        `rescan ${FOLDER.folder.id}`,
        `series ${SERIES_ID}`,
      ]);
    });

    test("says nothing when checking again finds the folder back", async ({
      page,
    }) => {
      missingAnswers = [FOLDER, null];
      await page.goto(`/series/${SERIES_ID}`);

      await card(page).getByRole("button", { name: "Check again" }).click();

      await expect
        .poll(() => asked)
        .toEqual([
          `series ${SERIES_ID}`,
          `rescan ${FOLDER.folder.id}`,
          `series ${SERIES_ID}`,
        ]);
      await expect(notice(page, "Still not connected")).toHaveCount(0);
    });

    test("says why instead of opening a book that isn't connected", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await page
        .getByRole("button", { name: new RegExp(`^${SHELF.titleOf(0)}`) })
        .click();

      await expect(
        notice(page, `${SHELF.titleOf(0)} isn’t connected`),
      ).toContainText("It can’t be opened until its folder or drive is back.");
      expect(new URL(page.url()).pathname).toBe(`/series/${SERIES_ID}`);
    });

    test("turns Continue into Find the folder for the next book", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await page
        .getByRole("button", { name: `Find the folder for ${UP_NEXT}` })
        .click();

      await expect
        .poll(() => asked)
        .toEqual([`book ${SHELF.idOf(2)}`, `relocate ${FOLDER.folder.id}`]);
    });

    for (const width of [MEDIUM_MIN_WIDTH + 100, EXPANDED_MIN_WIDTH + 200]) {
      test.describe(`on an Android tablet ${String(width)}px wide`, () => {
        test.use({ viewport: { width, height: 900 } });

        test("warns, dims and tags the series, and its books say why", async ({
          page,
        }) => {
          await page.goto(`/series/${SERIES_ID}`);

          await expect(card(page)).toBeVisible();
          await expect(
            page.getByRole("img", { name: `Cover of ${SERIES_TITLE}` }),
          ).toHaveCSS("opacity", "0.45");
          const away = page.getByRole("button", {
            name: new RegExp(`^${SHELF.titleOf(0)}`),
          });
          await page
            .getByRole(width >= EXPANDED_MIN_WIDTH ? "table" : "list", {
              name: "Books",
            })
            .scrollIntoViewIfNeeded();
          await away.click();
          await expect(
            notice(page, `${SHELF.titleOf(0)} isn’t connected`),
          ).toBeVisible();
        });

        test("turns Continue into Find the folder for the next book", async ({
          page,
        }) => {
          await page.goto(`/series/${SERIES_ID}`);

          await page
            .getByRole("button", { name: `Find the folder for ${UP_NEXT}` })
            .click();

          await expect
            .poll(() => asked)
            .toEqual([`book ${SHELF.idOf(2)}`, `relocate ${FOLDER.folder.id}`]);
        });
      });
    }

    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes the accessibility checks in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`/series/${SERIES_ID}`);
        await expect(card(page)).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

const PARTLY = new FakeShelf([READ, UNREAD, UNREAD, UNREAD]);
for (const book of PARTLY.books.slice(2)) {
  book.file = { kind: "notConnected" };
}

test.describe(
  "a series that is partly connected on an Android phone",
  { tag: "@native" },
  () => {
    const shelf = PARTLY.backend();
    test.use({
      backend: {
        ...shelf,
        seriesOverview: async (id) => ({
          ...(await shelf.seriesOverview(id)),
          connection: { kind: "partlyConnected", booksNotConnected: 2 },
        }),
        seriesMissingFolder: (id) => {
          asked.push(`series ${id}`);
          return FOLDER;
        },
        relocateLibraryFolder: (id) => {
          asked.push(`relocate ${id}`);
          return null;
        },
      },
    });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Not connected look");
      asked = [];
    });

    function partlyCard(page: Page): Locator {
      return page
        .locator('[data-slot="alert"]')
        .filter({ hasText: "2 of 4 books aren’t connected" });
    }

    test("names the books that aren't connected and offers only Find the folder", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await expect(partlyCard(page)).toContainText(
        `${PARTLY.titleOf(2)} and ${PARTLY.titleOf(3)} are on a drive that is not there. The other 2 open as usual. Your reading progress is safe.`,
      );
      await expect(partlyCard(page).getByRole("button")).toHaveText([
        "Find the folder",
      ]);
    });

    test("finds the folder from the card and still continues from a book that is there", async ({
      page,
    }) => {
      await page.goto(`/series/${SERIES_ID}`);

      await partlyCard(page)
        .getByRole("button", { name: "Find the folder" })
        .click();

      await expect
        .poll(() => asked)
        .toEqual([`series ${SERIES_ID}`, `relocate ${FOLDER.folder.id}`]);
      await expect(
        page.getByRole("link", { name: new RegExp(PARTLY.titleOf(1)) }).first(),
      ).toBeVisible();
    });

    test("leaves the cover and count line as they are", async ({ page }) => {
      await page.goto(`/series/${SERIES_ID}`);
      await expect(partlyCard(page)).toBeVisible();

      await expect(
        page.getByRole("img", { name: `Cover of ${SERIES_TITLE}` }),
      ).toHaveCSS("opacity", "1");
    });
  },
);
