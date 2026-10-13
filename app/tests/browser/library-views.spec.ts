import type { Locator, Page } from "@playwright/test";

import {
  COVERS_PER_ROW,
  type CoversPerRow,
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import type { ScreenSize } from "../../src/lib/library/library-view.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  LARGEST_TEXT_SCALE,
  setTextScale,
  sidewaysOverflow,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import {
  choose,
  openViewOptions,
  viewOptions,
  viewOptionsButton,
} from "./view-options.ts";

interface GridLook {
  readonly columns: number;
  readonly gap: number;
  readonly titleSize: number;
  readonly showsBookCount: boolean;
}

interface ListLook {
  readonly rowHeight: number;
  readonly coverWidth: number;
  readonly coverHeight: number;
}

const PANEL_WIDTH = 360;
const NARROWEST_COVER = 40;
const NARROWEST_SCREENS = [320, 600, 840, 1200];
const TABLET_NARROWEST = 600;
const EXPANDED_TABLET = 840;
const TEXT_SCALES = [1, 1.15, 1.3, 1.5, 1.75, 2];
const LARGE_TEXT_SCALES = [1.5, 2];
const READABLE_TITLE_WIDTHS = [840, 1280];
const READABLE_TITLE_EMS = 5;
const COMPACT_WIDTHS = [600, 640, 700, 744, 840, 900, 1024, 1200, 1280, 1440];
const DRAWN_DISPLAYS = ["grid", "compact", "covers"] as const;
const DENSE_GRID_WIDTHS = [600, 744, 840, 1024, 1200, 1280, 1440];
const SCREEN_HEIGHT = 900;
const SCROLL_RETRY_MS = 500;
const MOST_COVERS_PER_ROW = {
  phone: COVERS_PER_ROW.phone.most,
  tablet: COVERS_PER_ROW.tablet.most,
  desktop: COVERS_PER_ROW.desktop.most,
} as const satisfies CoversPerRow;
const MOST_COVERS_PER_ROW_WITH_BOOK_COUNTS = {
  phone: 3,
  tablet: 8,
  desktop: 8,
} as const satisfies CoversPerRow;

const RANGE_LABELS = {
  phone: "2 to 5 on this phone",
  tablet: "3 to 8 on this tablet",
  desktop: "4 to 12",
} as const satisfies Record<ScreenSize, string>;
const SERIES_IN_CATALOG = 200;
const LAST_TITLE = `Sample Series ${String(SERIES_IN_CATALOG).padStart(4, "0")}`;
const FIRST_TITLE = "Sample Series 0001";
const WHOLE_PIXEL = 1;
const LONG_TITLE =
  "Sample Series 0001 Collected Edition, Volumes One to Thirty, with Every Extra Chapter (Digital)";
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

const GRID_LOOKS = {
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
} as const satisfies Record<ScreenSize, readonly GridLook[]>;

const LIST_LOOKS = {
  phone: { rowHeight: 105, coverWidth: 48, coverHeight: 72 },
  tablet: { rowHeight: 105, coverWidth: 48, coverHeight: 72 },
  desktop: { rowHeight: 89, coverWidth: 42, coverHeight: 63 },
} as const satisfies Record<ScreenSize, ListLook>;

const BAND_PADDING = {
  phone: { top: 20, inline: 6, bottom: 8 },
  tablet: { top: 20, inline: 10, bottom: 10 },
  desktop: { top: 20, inline: 10, bottom: 10 },
} as const satisfies Record<ScreenSize, Record<string, number>>;

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;
let storedViews: LibraryView[] = [];
let seriesInCatalog = SERIES_IN_CATALOG;
let firstTitle = FIRST_TITLE;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() =>
      sampleSeries(seriesInCatalog).map((series, index) => ({
        ...series,
        title: index === 0 ? firstTitle : series.title,
        cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
      })),
    ),
    libraryView: () => storedView,
    setLibraryView: (view) => {
      storedView = view;
      storedViews.push(view);
      return null;
    },
    librarySeriesCount: () => SERIES_IN_CATALOG,
  },
});

test.beforeEach(async ({ page }) => {
  storedView = DEFAULT_LIBRARY_VIEW;
  storedViews = [];
  seriesInCatalog = SERIES_IN_CATALOG;
  firstTitle = FIRST_TITLE;
  await page.route(fakeProtocolRoute("omni"), (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE }),
  );
});

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

function columnWidthsOf(list: Locator): Promise<number[]> {
  return list.evaluate((element) =>
    getComputedStyle(element)
      .gridTemplateColumns.split(" ")
      .filter((track) => track !== "")
      .map((track) => Number.parseFloat(track)),
  );
}

function titlesOutOfSight(list: Locator): Promise<number> {
  return list.evaluate(
    (element) =>
      [...element.querySelectorAll("li p")].filter((title) => {
        const { width, height } = title.getBoundingClientRect();
        return width * height <= 1;
      }).length,
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
  const [, look] = GRID_LOOKS[screenSizeOf(page)];

  await openWith(page, viewWith(page, "grid", look.columns));

  expect(await columnsOf(seriesList(page))).toBe(look.columns);
});

test("spaces the grid and sizes its titles for each number of covers per row", async ({
  page,
}) => {
  for (const look of GRID_LOOKS[screenSizeOf(page)]) {
    await openWith(page, viewWith(page, "grid", look.columns));
    const title = firstSeries(page).getByText(FIRST_TITLE);
    const bookCount = firstSeries(page).getByText("1 book");

    expect(await columnsOf(seriesList(page))).toBe(look.columns);
    expect(await pixels(seriesList(page), "columnGap")).toBe(look.gap);
    expect(await pixels(title, "fontSize")).toBe(look.titleSize);
    await expect(bookCount).toBeVisible({ visible: look.showsBookCount });
  }
});

test.describe("at every text size", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "each engine sets every width itself, from the desktop",
  );

  for (const display of DRAWN_DISPLAYS) {
    test(`draws each size's most covers per row as ${display} down to its narrowest screen at the default text size`, async ({
      page,
    }) => {
      for (const width of NARROWEST_SCREENS) {
        await page.setViewportSize({ width, height: SCREEN_HEIGHT });
        await openWith(page, {
          ...DEFAULT_LIBRARY_VIEW,
          display,
          coversPerRow: MOST_COVERS_PER_ROW,
        });

        expect(await columnsOf(seriesList(page)), `at ${String(width)}px`).toBe(
          MOST_COVERS_PER_ROW[screenSizeOf(page)],
        );
      }
    });
  }

  test("draws fewer, wider covers per row than asked once the largest text needs the room", async ({
    page,
  }) => {
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await page.setViewportSize({
      width: EXPANDED_TABLET,
      height: SCREEN_HEIGHT,
    });

    await openWith(page, {
      ...DEFAULT_LIBRARY_VIEW,
      coversPerRow: MOST_COVERS_PER_ROW,
    });

    const widths = await columnWidthsOf(seriesList(page));
    expect(widths.length).toBeLessThan(MOST_COVERS_PER_ROW.tablet);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(
      NARROWEST_COVER * LARGEST_TEXT_SCALE,
    );
  });

  for (const scale of TEXT_SCALES) {
    test(`keeps every compact title in sight and whole in the narrowest covers with the text at ${String(scale)} times its size`, async ({
      page,
    }) => {
      firstTitle = LONG_TITLE;
      await setTextScale(page, scale);
      await openWith(page, {
        ...DEFAULT_LIBRARY_VIEW,
        display: "compact",
        coversPerRow: MOST_COVERS_PER_ROW,
      });

      for (const width of COMPACT_WIDTHS) {
        await page.setViewportSize({ width, height: SCREEN_HEIGHT });

        expect(await sidewaysOverflow(page), `at ${String(width)}px`).toEqual(
          [],
        );
        expect(
          await titlesOutOfSight(seriesList(page)),
          `at ${String(width)}px`,
        ).toBe(0);
      }
    });
  }

  for (const scale of LARGE_TEXT_SCALES) {
    test(`gives a compact title room for about eight characters a line with the text at ${String(scale)} times its size`, async ({
      page,
    }) => {
      await setTextScale(page, scale);
      await openWith(page, {
        ...DEFAULT_LIBRARY_VIEW,
        display: "compact",
        coversPerRow: MOST_COVERS_PER_ROW,
      });
      const title = firstSeries(page).getByText(FIRST_TITLE);

      for (const width of READABLE_TITLE_WIDTHS) {
        await page.setViewportSize({ width, height: SCREEN_HEIGHT });

        const room = await title.evaluate(
          (element) =>
            element.clientWidth /
            Number.parseFloat(getComputedStyle(element).fontSize),
        );
        expect(room, `at ${String(width)}px`).toBeGreaterThanOrEqual(
          READABLE_TITLE_EMS,
        );
      }
    });
  }

  test("shows a compact title in a tablet's narrowest covers at the most covers per row", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: TABLET_NARROWEST,
      height: SCREEN_HEIGHT,
    });

    await openWith(page, {
      ...DEFAULT_LIBRARY_VIEW,
      display: "compact",
      coversPerRow: MOST_COVERS_PER_ROW,
    });

    const title = await boxOf(firstSeries(page).getByText(FIRST_TITLE));
    expect(await columnsOf(seriesList(page))).toBe(MOST_COVERS_PER_ROW.tablet);
    expect(title.width * title.height).toBeGreaterThan(1);
    expect(await sidewaysOverflow(page)).toEqual([]);
  });

  test("lays out the rows by the covers the largest text draws, as far as the last series", async ({
    page,
  }) => {
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await page.setViewportSize({
      width: EXPANDED_TABLET,
      height: SCREEN_HEIGHT,
    });
    await openWith(page, {
      ...DEFAULT_LIBRARY_VIEW,
      coversPerRow: MOST_COVERS_PER_ROW,
    });
    const columns = await columnsOf(seriesList(page));
    await expectRowsToFillTheScreen(page);

    const last = seriesList(page).getByText(LAST_TITLE);
    await expect(async () => {
      await page.getByRole("main").evaluate((main) => {
        main.scrollTo({ top: main.scrollHeight });
      });
      await expect(last).toBeInViewport({ timeout: SCROLL_RETRY_MS });
    }).toPass({ intervals: [SCROLL_RETRY_MS] });

    const firstLaidOut = await seriesList(page)
      .getByRole("listitem")
      .first()
      .getAttribute("aria-posinset");
    expect((Number(firstLaidOut) - 1) % columns).toBe(0);
    await expect(seriesList(page).getByRole("listitem").last()).toHaveAttribute(
      "aria-posinset",
      String(SERIES_IN_CATALOG),
    );
    expect(
      await seriesList(page).evaluate((list) =>
        list.parentElement?.style.getPropertyValue("--row-count"),
      ),
    ).toBe(String(Math.ceil(SERIES_IN_CATALOG / columns)));
  });

  test("keeps a dense grid's book counts inside their columns in the pseudo-locale at every width", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.language", "en-XA");
    });
    storedView = {
      ...DEFAULT_LIBRARY_VIEW,
      coversPerRow: MOST_COVERS_PER_ROW_WITH_BOOK_COUNTS,
    };
    await page.goto("/");
    await expect(page.getByText(FIRST_TITLE).first()).toBeVisible();

    for (const width of DENSE_GRID_WIDTHS) {
      await page.setViewportSize({ width, height: SCREEN_HEIGHT });

      expect(await sidewaysOverflow(page), `at ${String(width)}px`).toEqual([]);
    }
  });
});

test("draws a compact grid with each title on a band across the foot of its cover", async ({
  page,
}) => {
  const padding = BAND_PADDING[screenSizeOf(page)];
  await openWith(page, viewWith(page, "compact"));
  const cover = firstSeries(page).getByRole("presentation");
  const band = firstSeries(page).getByText(FIRST_TITLE).locator("..");

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

test("ends a long compact title after two whole lines, cutting none in half", async ({
  page,
}) => {
  firstTitle = LONG_TITLE;
  await openWith(page, viewWith(page, "compact"));
  const title = firstSeries(page).getByText(LONG_TITLE);

  const clamp = await title.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    isClamped: element.scrollHeight > element.clientHeight,
  }));

  expect(Math.abs(clamp.height - 2 * clamp.lineHeight)).toBeLessThan(
    WHOLE_PIXEL,
  );
  expect(clamp.isClamped).toBe(true);
});

test("fades a compact title's band into the cover above it", async ({
  page,
}) => {
  await openWith(page, viewWith(page, "compact"));
  const band = firstSeries(page).getByText(FIRST_TITLE).locator("..");

  const background = await band.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );

  expect(background).toContain("linear-gradient");
});

test("draws only the covers, naming each one without printing its title", async ({
  page,
}) => {
  await openWith(page, viewWith(page, "covers"));
  const cover = firstSeries(page).getByRole("presentation").locator("..");
  const title = firstSeries(page).getByText(FIRST_TITLE);

  const titleBox = await boxOf(title);

  expect(await columnsOf(seriesList(page))).toBe(
    DEFAULT_LIBRARY_VIEW.coversPerRow[screenSizeOf(page)],
  );
  expect(titleBox.width * titleBox.height).toBeLessThanOrEqual(1);
  await expect(cover).toHaveAttribute("title", FIRST_TITLE);
  await expect(firstSeries(page).getByText("1 book")).toHaveCount(0);
});

test("draws a list with a small cover beside each title and its book count", async ({
  page,
}) => {
  const look = LIST_LOOKS[screenSizeOf(page)];
  await openWith(page, viewWith(page, "list"));
  const cover = await boxOf(firstSeries(page).getByRole("presentation"));
  const title = await boxOf(firstSeries(page).getByText(FIRST_TITLE));

  const row = await boxOf(firstSeries(page));

  expect(await columnsOf(seriesList(page))).toBe(1);
  expect(row.height).toBe(look.rowHeight);
  expect(cover.width).toBe(look.coverWidth);
  expect(cover.height).toBe(look.coverHeight);
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

for (const display of ["compact", "covers", "list"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the ${display} library has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openWith(page, viewWith(page, display));

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
}

function stepButton(options: Locator, step: "Fewer" | "More"): Locator {
  return options
    .getByRole("button", { name: `${step} covers per row` })
    .filter({ visible: true });
}

interface RowLayout {
  readonly lastBottom: number;
  readonly screenBottom: number;
  readonly rowStride: string;
  readonly firstRowStride: string;
}

function rowLayoutOf(list: Locator): Promise<RowLayout> {
  return list.evaluate((element) => {
    const first = element.firstElementChild;
    const last = element.lastElementChild;
    const rowGap = Number.parseFloat(getComputedStyle(element).rowGap);
    return {
      lastBottom: last?.getBoundingClientRect().bottom ?? 0,
      screenBottom: window.innerHeight,
      rowStride:
        element.parentElement?.style.getPropertyValue("--row-stride") ?? "",
      firstRowStride: `${String((first?.getBoundingClientRect().height ?? 0) + rowGap)}px`,
    };
  });
}

async function expectRowsToFillTheScreen(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const layout = await rowLayoutOf(seriesList(page));
      return {
        fillsTheScreen: layout.lastBottom >= layout.screenBottom,
        stridesByTheFirstRow: layout.rowStride === layout.firstRowStride,
      };
    })
    .toEqual({ fillsTheScreen: true, stridesByTheFirstRow: true });
}

test.describe("view options", () => {
  test("leaves the view options out of the empty library's header", async ({
    page,
  }) => {
    seriesInCatalog = 0;

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Your library is empty" }),
    ).toBeVisible();
    await expect(viewOptionsButton(page)).toHaveCount(0);
  });

  test("draws the display chosen in the view options at once and stores it on this device", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);

    await choose(options, "List");

    expect(await columnsOf(seriesList(page))).toBe(1);
    await expect.poll(() => storedView.display).toBe("list");
    await expect(options.getByRole("radio", { name: "List" })).toBeChecked();
  });

  test("offers this size's range of covers per row and stores each step", async ({
    page,
  }) => {
    const size = screenSizeOf(page);
    const { most } = COVERS_PER_ROW[size];
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);
    await expect(
      options.getByText(RANGE_LABELS[size], { exact: true }),
    ).toBeVisible();

    for (
      let count = DEFAULT_LIBRARY_VIEW.coversPerRow[size];
      count < most;
      count += 1
    ) {
      await stepButton(options, "More").click();
    }

    await expect(stepButton(options, "More")).toBeDisabled();
    await expect(
      options.locator("output").filter({ visible: true }),
    ).toHaveText(String(most));
    expect(await columnsOf(seriesList(page))).toBe(most);
    await expect.poll(() => storedView.coversPerRow[size]).toBe(most);
    expect(storedView.coversPerRow).toEqual({
      ...DEFAULT_LIBRARY_VIEW.coversPerRow,
      [size]: most,
    });
  });

  test("lays the rows out again to fill the screen once a row holds the most covers", async ({
    page,
  }) => {
    const { most } = COVERS_PER_ROW[screenSizeOf(page)];
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);
    await expectRowsToFillTheScreen(page);

    while ((await columnsOf(seriesList(page))) < most) {
      await stepButton(options, "More").click();
    }
    await page.keyboard.press("Escape");

    await expectRowsToFillTheScreen(page);
  });

  test("lays the rows out again to fill the screen once the grid turns compact", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);
    await expectRowsToFillTheScreen(page);

    await choose(options, "Compact");
    await page.keyboard.press("Escape");

    await expectRowsToFillTheScreen(page);
  });

  test("says how many covers fit once the largest text leaves room for fewer than asked", async ({
    page,
  }) => {
    const { most } = COVERS_PER_ROW[screenSizeOf(page)];
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openWith(page, viewWith(page, "grid", most));
    const fit = await columnsOf(seriesList(page));

    const options = await openViewOptions(page);

    const hint = options
      .getByText(`${String(fit)} fit at this text size`, { exact: true })
      .filter({ visible: true });
    expect(fit).toBeLessThan(most);
    await expect(hint).toBeVisible();
    await expect(
      hint.locator("xpath=ancestor::*[@aria-live='polite']"),
    ).toHaveCount(1);
  });

  test("stops saying how many covers fit once no more are asked for than fit", async ({
    page,
  }) => {
    const { most } = COVERS_PER_ROW[screenSizeOf(page)];
    await setTextScale(page, LARGEST_TEXT_SCALE);
    await openWith(page, viewWith(page, "grid", most));
    const fit = await columnsOf(seriesList(page));
    const options = await openViewOptions(page);

    for (let count = most; count > fit; count -= 1) {
      await stepButton(options, "Fewer").click();
    }

    await expect(
      options.locator("output").filter({ visible: true }),
    ).toHaveText(String(fit));
    await expect(
      options.getByText(/fits? at this text size$/).filter({ visible: true }),
    ).toHaveCount(0);
  });

  test("says nothing of how many covers fit at the default text size", async ({
    page,
  }) => {
    const { most } = COVERS_PER_ROW[screenSizeOf(page)];
    await openWith(page, viewWith(page, "grid", most));

    const options = await openViewOptions(page);

    await expect(
      options.getByText(/fits? at this text size$/).filter({ visible: true }),
    ).toHaveCount(0);
  });

  test("goes no lower than the fewest covers per row this size offers", async ({
    page,
  }) => {
    const size = screenSizeOf(page);
    const { fewest } = COVERS_PER_ROW[size];
    await openWith(page, viewWith(page, "grid", fewest + 1));
    const options = await openViewOptions(page);

    await stepButton(options, "Fewer").click();

    await expect(stepButton(options, "Fewer")).toBeDisabled();
    expect(await columnsOf(seriesList(page))).toBe(fewest);
    await expect.poll(() => storedView.coversPerRow[size]).toBe(fewest);
  });

  test("shows how many series the library holds beside its title once item counts are on", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const count = page
      .getByRole("main")
      .getByText(`${String(SERIES_IN_CATALOG)} series`, { exact: true });
    await expect(count).toHaveCount(0);
    const options = await openViewOptions(page);

    await choose(options, "Item counts");

    await expect(count).toBeAttached();
    const title = await boxOf(
      page.getByRole("heading", { level: 1, name: "Library" }),
    );
    const shown = await boxOf(count.locator(".."));
    expect(shown.x).toBeGreaterThan(title.x + title.width);
    await expect.poll(() => storedView.showsItemCounts).toBe(true);
  });

  test("fits each display's label inside its segment", async ({ page }) => {
    await openWith(page, viewWith(page, "grid"));
    const options = await openViewOptions(page);

    const overflowing = await options
      .locator("label")
      .filter({ has: page.getByRole("radio") })
      .evaluateAll((labels) =>
        labels
          .filter((label) => label.scrollWidth > label.clientWidth)
          .map((label) => label.textContent.trim()),
      );

    expect(overflowing).toEqual([]);
  });

  test("pads every display's label alike on both sides", async ({ page }) => {
    await openWith(page, viewWith(page, "compact"));
    const options = await openViewOptions(page);

    const gaps = await options
      .locator("label")
      .filter({ has: page.getByRole("radio") })
      .evaluateAll((labels) =>
        labels.map((label) => {
          const box = label.getBoundingClientRect();
          const icon = label.querySelector("svg")?.getBoundingClientRect();
          const words = label
            .querySelector("span > span:not([aria-hidden])")
            ?.getBoundingClientRect();
          if (words === undefined) {
            throw new Error("a display segment has no label");
          }
          return {
            top: Math.round(box.top),
            start: Math.round((icon?.left ?? words.left) - box.left),
            end: Math.round(box.right - words.right),
          };
        }),
      );
    const isOneRow = new Set(gaps.map((gap) => gap.top)).size === 1;

    const [first] = gaps;
    for (const gap of gaps) {
      expect(Math.abs(gap.start - gap.end)).toBeLessThanOrEqual(1);
      if (isOneRow) {
        expect(Math.abs(gap.start - (first?.start ?? 0))).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  test("keeps each display's segment its width whichever is chosen", async ({
    page,
  }) => {
    await openWith(page, viewWith(page, "grid"));
    const options = await openViewOptions(page);
    const widths = () =>
      options
        .locator("label")
        .filter({ has: page.getByRole("radio") })
        .evaluateAll((labels) =>
          labels.map((label) =>
            Math.round(label.getBoundingClientRect().width),
          ),
        );
    const before = await widths();

    await choose(options, "Compact");

    await expect.poll(widths).toEqual(before);
  });

  test("offers covers only and stores it on this device", async ({ page }) => {
    await openWith(page, viewWith(page, "grid"));
    const options = await openViewOptions(page);

    await choose(options, "Covers");

    await expect.poll(() => storedView.display).toBe("covers");
    await expect(
      firstSeries(page).getByRole("presentation").locator(".."),
    ).toHaveAttribute("title", FIRST_TITLE);
  });

  test("draws the view chosen before when the library opens again", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);
    await choose(options, "Compact");
    await expect.poll(() => storedViews.length).toBe(1);

    await page.reload();

    await expect(firstSeries(page)).toContainText(FIRST_TITLE);
    await expect(firstSeries(page).getByText("1 book")).toHaveCount(0);
    await expect(
      (await openViewOptions(page)).getByRole("radio", { name: "Compact" }),
    ).toBeChecked();
  });

  test("closes on Escape and hands focus back to the button that opened it", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    await viewOptionsButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(viewOptions(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(viewOptions(page)).toBeHidden();
    await expect(viewOptionsButton(page)).toBeFocused();
  });

  test("moves between the displays with the arrow keys", async ({ page }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);
    await options.getByRole("radio", { name: "Grid" }).focus();

    await page.keyboard.press("ArrowRight");

    await expect(options.getByRole("radio", { name: "Compact" })).toBeChecked();
    await expect.poll(() => storedView.display).toBe("compact");
  });

  test("slides up from the foot of a phone, and drops below the button on wider screens", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    const options = await openViewOptions(page);

    const panel = await boxOf(options);
    const button = await boxOf(viewOptionsButton(page));

    const { width, height } = viewportOf(page);
    if (screenSizeOf(page) === "phone") {
      expect(panel.y + panel.height).toBe(height);
      expect(panel.width).toBe(width);
      await options.getByRole("button", { name: "Done" }).click();
      await expect(options).toBeHidden();
    } else {
      expect(panel.y).toBeGreaterThan(button.y + button.height);
      expect(panel.x + panel.width).toBeCloseTo(button.x + button.width, 0);
      expect(panel.width).toBe(PANEL_WIDTH);
      await page.mouse.click(1, height - 1);
      await expect(options).toBeHidden();
    }
  });

  test("lines the panel up with the button's end in a right-to-left layout, or spans a phone", async ({
    page,
  }) => {
    await openWith(page, DEFAULT_LIBRARY_VIEW);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    const options = await openViewOptions(page);

    const panel = await boxOf(options);
    const button = await boxOf(viewOptionsButton(page));
    if (screenSizeOf(page) === "phone") {
      expect(panel.x).toBe(0);
      expect(panel.width).toBe(viewportOf(page).width);
    } else {
      expect(panel.x).toBeCloseTo(button.x, 0);
    }
  });

  test("keeps the view options inside the screen in a longer language", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("omnileaf.language", "en-XA");
    });
    storedView = DEFAULT_LIBRARY_VIEW;
    await page.goto("/");
    await expect(
      page.getByRole("main").getByRole("listitem").first(),
    ).toBeVisible();

    await page
      .getByRole("main")
      .locator('button[aria-haspopup="dialog"]')
      .click();
    const options = page.getByRole("dialog");
    await expect(options).toBeVisible();

    const box = await boxOf(options);
    const overflows = await options.evaluate(
      (dialog) => dialog.scrollWidth > dialog.clientWidth,
    );
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewportOf(page).width);
    expect(overflows).toBe(false);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the open view options have no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openWith(page, DEFAULT_LIBRARY_VIEW);
      await openViewOptions(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
