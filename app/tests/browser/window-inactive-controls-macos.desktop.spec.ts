import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
  type SeriesDetails,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const LIBRARY = sampleSeries(6);
const VIEW: LibraryView = { ...DEFAULT_LIBRARY_VIEW, display: "list" };
const CHECK_FILL = {
  light: "rgba(0, 0, 0, 0.14)",
  dark: "rgba(255, 255, 255, 0.1)",
};
const CHECK_INK = { light: "rgba(0, 0, 0, 0.7)", dark: "#ffffff" };
const PICKED_ROW =
  "color-mix(in oklab, var(--native-color-control-fill-pressed) 87.5%, transparent)";

const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: "A lighthouse keeper’s apprentice.", edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;

const shelf = new FakeShelf([{ state: "notStarted" }]);

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: LIBRARY, next: null }),
  librarySeriesCount: () => LIBRARY.length,
  libraryView: () => VIEW,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  keepsDetailEdits: () => true,
  seriesDetails: () => DETAILS,
  editSeriesDetails: () => null,
};

testOnlyInItsWebview("macos");
test.use({
  backend: BACKEND,
  platform: "macos",
  viewport: { width: 1280, height: 800 },
});

async function loseFocus(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
      });
      return page.evaluate(() =>
        document.documentElement.getAttribute("data-window-active"),
      );
    })
    .toBe("false");
}

async function tickedMark(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("region", { name: "Details" })
    .getByRole("button", { name: "Edit details" })
    .click();
  const mark = page
    .getByRole("dialog", { name: "Edit details" })
    .getByRole("checkbox", { name: "Mark as 18+" });
  await mark.click();
  await expect(mark).toBeChecked();
  return mark;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`a Mac window that lost focus in the ${scheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test("plates a ticked checkbox in a grey fill with a grey tick", async ({
      page,
    }) => {
      const mark = await tickedMark(page);

      await loseFocus(page);

      await expect(mark).toHaveCSS(
        "background-color",
        await literalColour(page, CHECK_FILL[scheme]),
      );
      await expect(mark).toHaveCSS(
        "color",
        await literalColour(page, CHECK_INK[scheme]),
      );
    });

    test("plates the chosen radio in a grey fill with a grey dot", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      const mark = page.getByRole("radio", { checked: true }).first();
      await expect(mark).toBeVisible();

      await loseFocus(page);

      await expect(mark.locator("> span").first()).toHaveCSS(
        "background-color",
        await literalColour(page, CHECK_FILL[scheme]),
      );
    });
  });
}

test("greys a selected table row instead of filling it with the accent", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-series-id]")).toHaveCount(LIBRARY.length);
  await page.locator("[data-series-id]").nth(1).getByRole("link").click();

  await loseFocus(page);

  await expect(page.locator("[data-series-id]").nth(1)).toHaveCSS(
    "background-color",
    await literalColour(page, PICKED_ROW),
  );
});
