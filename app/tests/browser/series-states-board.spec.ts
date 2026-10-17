import type { Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READ = { state: "read" } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const SEARCH = "harbour";

function isWide(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

function title(page: Page) {
  return page.getByRole("heading", { level: 1, name: SERIES_TITLE });
}

test.describe("while the series is read in", () => {
  let release: () => void = () => undefined;

  test.use({
    backend: {
      ...new FakeShelf([READ, NOT_STARTED]).backend(),
      seriesOverview: async (id) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return new FakeShelf([READ, NOT_STARTED]).backend().seriesOverview(id);
      },
    },
  });

  test("shows skeletons in the page's shape, with the way back working at once", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await expect(
      page.getByRole("status", { name: "Loading the series" }),
    ).toBeVisible();
    await expect(
      isWide(page)
        ? page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: "Library" })
        : page.getByRole("link", { name: "Back to the library" }),
    ).toBeVisible();
    release();
    await expect(title(page)).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading the series" }),
    ).toHaveCount(0);
  });
});

test.describe("when the series can't be read", () => {
  let reads = 0;
  const shelf = new FakeShelf([READ, NOT_STARTED]);

  test.beforeEach(() => {
    reads = 0;
  });

  test.use({
    backend: {
      ...shelf.backend(),
      seriesOverview: (id) => {
        reads += 1;
        if (reads === 1) {
          throw new CommandFailure({
            code: "internal",
            message: "the catalog couldn't be read",
          });
        }
        return shelf.backend().seriesOverview(id);
      },
    },
  });

  test("says so, that nothing changed, and tries again", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const alert = page.getByRole("alert");

    await expect(alert).toContainText(
      "Couldn't load this series. Try again later.",
    );
    await expect(alert).toContainText("Nothing in your library has changed.");
    await expect(page.locator("[data-series-band]")).toHaveCount(0);
    await alert.getByRole("button", { name: "Try again" }).click();

    await expect(title(page)).toBeVisible();
  });
});

test.describe("a series whose books have gone", () => {
  let rescans = 0;
  const empty: FakeBackend = {
    ...new FakeShelf([]).backend(),
    rescanLibraryFolders: () => {
      rescans += 1;
      return DEFAULT_BACKEND.rescanLibraryFolders();
    },
  };

  test.use({ backend: empty });

  test("offers to rescan its folder in place of the books", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    await expect(title(page)).toBeVisible();

    await expect(
      page.getByRole("heading", { level: 2, name: "No books in this series" }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Show" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Mark .*read$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: /^(Continue|Up next|You’ve read)/ }),
    ).toHaveCount(0);
    const before = rescans;
    await page.getByRole("button", { name: "Rescan the folder" }).click();

    await expect.poll(() => rescans).toBe(before + 1);
  });
});

test.describe("a series read to the end", () => {
  test.use({ backend: new FakeShelf([READ, READ, READ]).backend() });

  test("says every book is read when only unread ones show, and shows them all again", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const show = page.getByRole("group", { name: "Show" });

    await show.getByRole("radio", { name: "Unread" }).click();
    await expect(
      page.getByText("Every book in this series is read.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show all books" }).click();

    await expect(show.getByRole("radio", { name: "All" })).toBeChecked();
  });
});

test.describe("a search with no match", () => {
  test.use({ backend: new FakeShelf([READ, NOT_STARTED]).backend() });

  test("says no book matches and clears the search", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);
    await expect(page.getByRole("group", { name: "Show" })).toBeVisible();
    const find = page.getByRole("button", { name: "Find a book" });
    if (await find.isVisible()) {
      await find.click();
    }
    const field = page.getByRole("searchbox", { name: "Find a book" });

    await field.fill(SEARCH);
    await expect(
      page.getByText(`No book in this series matches “${SEARCH}”.`, {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear the search" }).click();

    await expect(field).toHaveValue("");
  });
});
