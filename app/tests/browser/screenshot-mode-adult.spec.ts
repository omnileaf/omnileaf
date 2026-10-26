import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryFilter,
} from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SHORTCUT = "Control+Shift+H";
const ADULT_TITLE = "Sample Series 0003";
const LIBRARY = sampleSeries(12).map((series) => ({
  ...series,
  isAdult: series.title === ADULT_TITLE || series.title.endsWith("0007"),
}));

function admitted(filter: LibraryFilter) {
  return LIBRARY.filter((series) =>
    filter.adult === "hide"
      ? !series.isAdult
      : filter.adult === "only"
        ? series.isAdult
        : true,
  );
}

let asked: LibraryFilter[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: (after, listing) => {
      asked.push(listing.filter);
      return pagedSeries(() => admitted(listing.filter))(after, listing);
    },
    librarySeriesCount: (filter) => admitted(filter).length,
    libraryView: () => ({
      ...DEFAULT_LIBRARY_VIEW,
      showsItemCounts: true,
    }),
  },
});

test.beforeEach(() => {
  asked = [];
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function openTheLibraryOnADesktop(page: Page): Promise<void> {
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH ||
      test.info().project.use.isMobile === true,
    "the desktop's Screenshot mode shortcut",
  );
  await page.goto("/");
  await expect(seriesList(page)).toBeVisible();
}

test("hides 18+ series and leaves them out of the total in Screenshot mode", async ({
  page,
}) => {
  await openTheLibraryOnADesktop(page);
  await expect(page.getByText("12 series")).toBeVisible();

  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("10 series")).toBeVisible();
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(10);
  expect(asked.at(-1)?.adult).toBe("hide");
});

test("brings 18+ series back unchanged once Screenshot mode turns off", async ({
  page,
}) => {
  await openTheLibraryOnADesktop(page);
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("10 series")).toBeVisible();

  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("12 series")).toBeVisible();
  expect(asked.at(-1)?.adult).toBe("any");
});

test("says Screenshot mode is on with the shortcut, and turns it off from the notice", async ({
  page,
}) => {
  await openTheLibraryOnADesktop(page);
  await page.keyboard.press(SHORTCUT);
  const notice = page
    .getByRole("listitem")
    .filter({ hasText: "Screenshot mode is on" });
  await expect(notice).toContainText("Ctrl Shift H");

  await notice.getByRole("button", { name: "Turn off" }).click();

  await expect(page.getByText("12 series")).toBeVisible();
  await expect(notice).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no accessibility violations with the notice shown in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openTheLibraryOnADesktop(page);
    await page.keyboard.press(SHORTCUT);
    await expect(page.getByText("Screenshot mode is on")).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}
