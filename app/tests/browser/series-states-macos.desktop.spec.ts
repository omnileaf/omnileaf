import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const WINDOW = { width: 1280, height: 800 };
const LARGE_BUTTON_HEIGHT = 28;
const EMPTY_BUTTON_GAP = "10px";

test.use({ viewport: WINDOW });

function emptyButtons(page: Page) {
  return page
    .getByRole("main")
    .getByRole("button", { name: /^(Show in|Rescan)/ });
}

test.describe("a series that can't be read on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({
    platform: "macos",
    backend: {
      ...DEFAULT_BACKEND,
      seriesOverview: () => {
        throw new CommandFailure({ code: "internal", message: "unread" });
      },
    },
  });

  test("offers Try again as a large Mac button", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);
    const tryAgain = page
      .getByRole("alert")
      .getByRole("button", { name: "Try again" });

    expect((await boxOf(tryAgain)).height).toBe(LARGE_BUTTON_HEIGHT);
    await expect(tryAgain).toHaveCSS("margin-block-start", EMPTY_BUTTON_GAP);
    await expect(tryAgain).toHaveCSS("border-top-width", "0px");
  });
});

test.describe("a series that can't be read on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({
    platform: "linux",
    backend: {
      ...DEFAULT_BACKEND,
      seriesOverview: () => {
        throw new CommandFailure({ code: "internal", message: "unread" });
      },
    },
  });

  test("keeps its outlined Try again", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await expect(
      page.getByRole("alert").getByRole("button", { name: "Try again" }),
    ).toHaveCSS("border-top-width", "1px");
  });
});

test.describe("a series without books on macOS", () => {
  testOnlyInItsWebview("macos");
  const shown: string[] = [];
  test.use({
    platform: "macos",
    backend: {
      ...DEFAULT_BACKEND,
      ...new FakeShelf([]).backend(),
      showSeriesInFolder: (series) => {
        shown.push(series);
        return null;
      },
    },
  });

  test("puts Show in Finder first and Rescan last, as large Mac buttons", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await expect(emptyButtons(page)).toHaveText([
      "Show in Finder",
      "Rescan the folder",
    ]);
    for (const button of await emptyButtons(page).all()) {
      expect((await boxOf(button)).height).toBe(LARGE_BUTTON_HEIGHT);
    }
    await emptyButtons(page).first().click();
    expect(shown).toEqual([SERIES_ID]);
  });
});

test.describe("a series without books on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({
    platform: "linux",
    backend: { ...DEFAULT_BACKEND, ...new FakeShelf([]).backend() },
  });

  test("keeps Rescan first", async ({ page }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await expect(emptyButtons(page)).toHaveText([
      "Rescan the folder",
      "Show in folder",
    ]);
  });
});
