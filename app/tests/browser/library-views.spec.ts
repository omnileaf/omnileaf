import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

type ScreenSize = keyof LibraryView["coversPerRow"];

interface GridBoard {
  readonly columns: number;
  readonly gap: number;
  readonly titleSize: number;
  readonly showsBookCount: boolean;
}

interface ListBoard {
  readonly rowHeight: number;
  readonly coverWidth: number;
  readonly coverHeight: number;
}

const LARGE_MIN_WIDTH = 1200;
const SERIES_IN_CATALOG = 200;
const FIRST_TITLE = "Sample Series 0001";
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

const GRID_BOARDS = {
  phone: [
    { columns: 3, gap: 14, titleSize: 13, showsBookCount: true },
    { columns: 4, gap: 10, titleSize: 12, showsBookCount: false },
    { columns: 5, gap: 8, titleSize: 11, showsBookCount: false },
  ],
  tablet: [
    { columns: 5, gap: 20, titleSize: 14, showsBookCount: true },
    { columns: 7, gap: 14, titleSize: 14, showsBookCount: true },
  ],
  desktop: [
    { columns: 6, gap: 24, titleSize: 14, showsBookCount: true },
    { columns: 8, gap: 18, titleSize: 13, showsBookCount: true },
    { columns: 9, gap: 14, titleSize: 12, showsBookCount: false },
  ],
} as const satisfies Record<ScreenSize, readonly GridBoard[]>;

/** A row's height with its padding and the line under it, and the cover inside its edge. */
const LIST_BOARDS = {
  phone: { rowHeight: 105, coverWidth: 48, coverHeight: 72 },
  tablet: { rowHeight: 105, coverWidth: 48, coverHeight: 72 },
  desktop: { rowHeight: 89, coverWidth: 42, coverHeight: 63 },
} as const satisfies Record<ScreenSize, ListBoard>;

const BAND_PADDING = {
  phone: { top: 6, inline: 6, bottom: 8 },
  tablet: { top: 8, inline: 10, bottom: 10 },
  desktop: { top: 8, inline: 10, bottom: 10 },
} as const satisfies Record<ScreenSize, Record<string, number>>;

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() =>
      sampleSeries(SERIES_IN_CATALOG).map((series, index) => ({
        ...series,
        cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
      })),
    ),
    libraryView: () => storedView,
  },
});

test.beforeEach(async ({ page }) => {
  storedView = DEFAULT_LIBRARY_VIEW;
  await page.route(fakeProtocolRoute("omni"), (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE }),
  );
});

function screenSizeOf(page: Page): ScreenSize {
  const { width } = viewportOf(page);
  if (width >= LARGE_MIN_WIDTH) {
    return "desktop";
  }
  return width >= MEDIUM_MIN_WIDTH ? "tablet" : "phone";
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function firstSeries(page: Page): Locator {
  return seriesList(page).getByRole("listitem").first();
}

function viewWith(
  page: Page,
  display: LibraryDisplay,
  columns?: number,
): LibraryView {
  const size = screenSizeOf(page);
  return {
    ...DEFAULT_LIBRARY_VIEW,
    display,
    coversPerRow: {
      ...DEFAULT_LIBRARY_VIEW.coversPerRow,
      [size]: columns ?? DEFAULT_LIBRARY_VIEW.coversPerRow[size],
    },
  };
}

async function openWith(page: Page, view: LibraryView): Promise<void> {
  storedView = view;
  await page.goto("/");
  await expect(firstSeries(page)).toContainText(FIRST_TITLE);
}

function columnsOf(list: Locator): Promise<number> {
  return list.evaluate(
    (element) =>
      getComputedStyle(element)
        .gridTemplateColumns.split(" ")
        .filter((track) => track !== "").length,
  );
}

function pixels(locator: Locator, property: "columnGap" | "fontSize") {
  return locator.evaluate(
    (element, name) => Number.parseFloat(getComputedStyle(element)[name]),
    property,
  );
}

test("draws as many covers in a row as this size's stored view asks for", async ({
  page,
}) => {
  const [, board] = GRID_BOARDS[screenSizeOf(page)];

  await openWith(page, viewWith(page, "grid", board.columns));

  expect(await columnsOf(seriesList(page))).toBe(board.columns);
});

test("spaces the grid and sizes its titles as the boards do for each number of covers per row", async ({
  page,
}) => {
  for (const board of GRID_BOARDS[screenSizeOf(page)]) {
    await openWith(page, viewWith(page, "grid", board.columns));
    const title = firstSeries(page).getByText(FIRST_TITLE);
    const bookCount = firstSeries(page).getByText("1 book");

    expect(await columnsOf(seriesList(page))).toBe(board.columns);
    expect(await pixels(seriesList(page), "columnGap")).toBe(board.gap);
    expect(await pixels(title, "fontSize")).toBe(board.titleSize);
    await expect(bookCount).toBeVisible({ visible: board.showsBookCount });
  }
});

test("draws a compact grid with each title on a band across the foot of its cover", async ({
  page,
}) => {
  const padding = BAND_PADDING[screenSizeOf(page)];
  await openWith(page, viewWith(page, "compact"));
  const cover = firstSeries(page).getByRole("presentation");
  const band = firstSeries(page).getByText(FIRST_TITLE);

  const coverBox = await boxOf(cover);
  const bandBox = await boxOf(band);
  const bandPadding = await band.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      top: Number.parseFloat(style.paddingBlockStart),
      inline: Number.parseFloat(style.paddingInlineStart),
      bottom: Number.parseFloat(style.paddingBlockEnd),
    };
  });

  expect(bandBox.y + bandBox.height).toBeCloseTo(
    coverBox.y + coverBox.height,
    0,
  );
  expect(bandBox.width).toBeCloseTo(coverBox.width, 0);
  expect(bandPadding).toEqual(padding);
  await expect(firstSeries(page).getByText("1 book")).toHaveCount(0);
});

test("draws a list with a small cover beside each title and its book count", async ({
  page,
}) => {
  const board = LIST_BOARDS[screenSizeOf(page)];
  await openWith(page, viewWith(page, "list"));
  const cover = await boxOf(firstSeries(page).getByRole("presentation"));
  const title = await boxOf(firstSeries(page).getByText(FIRST_TITLE));

  const row = await boxOf(firstSeries(page));

  expect(await columnsOf(seriesList(page))).toBe(1);
  expect(row.height).toBe(board.rowHeight);
  expect(cover.width).toBe(board.coverWidth);
  expect(cover.height).toBe(board.coverHeight);
  expect(title.x).toBeGreaterThan(cover.x + cover.width);
  await expect(firstSeries(page).getByText("1 book")).toBeVisible();
});

test("starts a list row's cover at the reading direction's start in a right-to-left layout", async ({
  page,
}) => {
  await openWith(page, viewWith(page, "list"));
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  const cover = await boxOf(firstSeries(page).getByRole("presentation"));
  const title = await boxOf(firstSeries(page).getByText(FIRST_TITLE));

  expect(cover.x).toBeGreaterThan(title.x + title.width);
});

for (const display of ["compact", "list"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the ${display} library has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openWith(page, viewWith(page, display));

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
}
