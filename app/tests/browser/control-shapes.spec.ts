import type { Locator, Page } from "@playwright/test";

import { addFolderInFolders } from "./controls.ts";
import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  expect,
  LARGE_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NEXT_BOOK,
  PAGE_COUNT,
  readerBackend,
  servePages,
} from "./reader-book.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import { openViewOptions, viewOptionsButton } from "./view-options.ts";

const BUTTON_CORNER = "10px";
const ROW_CORNER = "8px";
const KEY_CORNER = "6px";
const PAGE_BUTTON_HEIGHT = 36;
const IOS_BUTTON_HEIGHT = 50;
const SHADCN_CORNER = "8px";
const PHONE_SECTION_BUTTON_HEIGHT = 48;
const FOLDERS_BUTTON_HEIGHT = 44;
const IOS_BUTTON_CORNER = "14px";
const SHEET_CORNER = "28px";
const PANEL_TITLE_SIZE = "17px";
const PANEL_TITLE_LINE_HEIGHT = 22.1;
const CHOSEN_SEGMENT_WEIGHT = "600";
const SEGMENT_WEIGHT = "500";
const DESKTOP_SEGMENT_HEIGHT = 32;
const DESKTOP_SEGMENT_TRACK_HEIGHT = 38;
const DESKTOP_SEGMENT_TRACK_CORNER = "8px";
const DESKTOP_SEGMENT_CORNER = "6px";
const DESKTOP_SEGMENT_TEXT = "12px";
const PHONE_SEGMENT_HEIGHT = 40;
const PHONE_SEGMENT_TRACK_HEIGHT = 48;
const PHONE_SEGMENT_TRACK_CORNER = "10px";
const PHONE_SEGMENT_CORNER = "8px";
const PHONE_SEGMENT_TEXT = "13px";
const DESKTOP_STEPPER_CORNER = "8px";
const ON_PAGE_14 = { state: "started", page: 14 } as const;
const NOT_STARTED = { state: "notStarted" } as const;
const DESKTOP_BUTTON_LOOKS = [
  { platform: "linux", height: 36, corner: "8px" },
  { platform: "macos", height: 28, corner: "6px" },
  { platform: "windows", height: 32, corner: "4px" },
] as const satisfies readonly {
  platform: Platform;
  height: number;
  corner: string;
}[];

function withSeries(platform: Platform): FakeBackend {
  const series = sampleSeries(12);
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => series),
    librarySeriesCount: () => series.length,
  };
}

function cornerOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).borderStartStartRadius,
  );
}

function emptyStateAddFolder(page: Page): Locator {
  return page
    .getByRole("region", { name: "Your library is empty" })
    .getByRole("button", { name: "Add a folder" });
}

function seriesOn(platform: Platform): FakeBackend {
  const shelf = new FakeShelf([ON_PAGE_14, NOT_STARTED]);
  return {
    ...shelf.backend(),
    appInfo: onPlatform(platform).backend.appInfo,
  };
}

function readerOn(platform: Platform): FakeBackend {
  return readerBackend(onPlatform(platform).backend);
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

async function openUpNext(page: Page): Promise<void> {
  await openBook(page);
  await page.keyboard.press("End");
  await expect(
    page.getByRole("img", { name: `Page ${String(PAGE_COUNT)}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { level: 2, name: `${BOOK_TITLE} finished` }),
  ).toBeVisible();
}

function seriesButtons(page: Page): Record<string, Locator> {
  const main = page.getByRole("main");
  return {
    sort: main.getByRole("button", { name: /^Sort: / }),
    continue: main.getByRole("link", { name: /^Continue / }),
  };
}

function phoneSeriesButtons(page: Page): Record<string, Locator> {
  const main = page.getByRole("main");
  return {
    ...seriesButtons(page),
    findABook: main.getByRole("button", { name: "Find a book" }),
    tags: main.getByRole("button", { name: `Tags for ${SERIES_TITLE}` }),
    markRead: main.getByRole("button", { name: `Mark ${SERIES_TITLE} read` }),
    details: main.getByRole("button", { name: "Details" }),
  };
}

function desktopSeriesButtons(page: Page): Record<string, Locator> {
  const main = page.getByRole("main");
  return {
    ...seriesButtons(page),
    tags: main.getByRole("button", { name: "Tags" }),
    markRead: main.getByRole("button", { name: "Mark read" }),
  };
}

function guideDone(page: Page): Locator {
  return page
    .getByRole("note", { name: /to turn pages$/ })
    .getByRole("button", { name: "Got it" });
}

function directionButton(page: Page): Locator {
  return page
    .getByRole("group", { name: "Quick settings" })
    .getByRole("button", { name: /^Left to right/ });
}

function upNextButtons(page: Page): Record<string, Locator> {
  return {
    read: page.getByRole("link", { name: `Read ${NEXT_BOOK.title}` }),
    back: page.getByRole("link", { name: "Back to the series" }),
  };
}

async function measureEach<T>(
  controls: Record<string, Locator>,
  measure: (control: Locator) => Promise<T>,
): Promise<Record<string, T>> {
  const measured = await Promise.all(
    Object.entries(controls).map(async ([name, control]) => {
      await expect(control).toBeVisible();
      return [name, await measure(control)] as const;
    }),
  );
  return Object.fromEntries(measured);
}

function eachOf<T>(
  controls: Record<string, Locator>,
  value: T,
): Record<string, T> {
  return Object.fromEntries(Object.keys(controls).map((name) => [name, value]));
}

async function isPill(control: Locator): Promise<boolean> {
  const box = await boxOf(control);
  return parseFloat(await cornerOf(control)) >= box.height / 2;
}

function displayTrack(panel: Locator): Locator {
  return panel.getByRole("radiogroup", { name: "Display" });
}

function displaySegment(panel: Locator, name: string): Locator {
  return panel.getByRole("radio", { name });
}

test.describe("in every segmented control", () => {
  test.use({ backend: withSeries("linux") });

  test("sets the chosen display in semibold and the others in medium", async ({
    page,
  }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);

    await expect(displaySegment(panel, "Grid")).toHaveCSS(
      "font-weight",
      CHOSEN_SEGMENT_WEIGHT,
    );
    await expect(displaySegment(panel, "Compact")).toHaveCSS(
      "font-weight",
      SEGMENT_WEIGHT,
    );
  });

  test("sets the chosen theme in semibold and the others in medium", async ({
    page,
  }) => {
    await page.goto("/settings/appearance");

    await expect(page.getByRole("radio", { checked: true })).toHaveCSS(
      "font-weight",
      CHOSEN_SEGMENT_WEIGHT,
    );
    await expect(page.getByRole("radio", { checked: false }).first()).toHaveCSS(
      "font-weight",
      SEGMENT_WEIGHT,
    );
  });
});

test.describe("on a desktop with an empty library", () => {
  test.use({ backend: onPlatform("linux").backend });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
  });

  test("draws the empty library's Add a folder 36px tall with 8px corners", async ({
    page,
  }) => {
    await page.goto("/");
    const addFolder = emptyStateAddFolder(page);
    await expect(addFolder).toBeVisible();

    const box = await boxOf(addFolder);

    expect(box.height).toBe(PAGE_BUTTON_HEIGHT);
    expect(await cornerOf(addFolder)).toBe(SHADCN_CORNER);
  });
});

for (const look of DESKTOP_BUTTON_LOOKS) {
  test.describe(`in the ${look.platform} library toolbar`, () => {
    test.use({ backend: withSeries(look.platform) });

    test.beforeEach(({ page }) => {
      test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
    });

    test("sizes Filter and View with the search field and rounds them the platform's way", async ({
      page,
    }) => {
      await page.goto("/");
      const search = page.getByRole("searchbox", {
        name: "Search the library",
      });
      await expect(search).toBeVisible();
      const filter = page
        .getByRole("main")
        .getByRole("button", { name: /^Sort and filter/ });
      const view = viewOptionsButton(page);

      const heights = await Promise.all(
        [search.locator(".."), filter, view].map(
          async (control) => (await boxOf(control)).height,
        ),
      );

      expect(heights).toEqual([look.height, look.height, look.height]);
      expect([await cornerOf(filter), await cornerOf(view)]).toEqual([
        look.corner,
        look.corner,
      ]);
    });
  });

  test.describe(`on a ${look.platform} desktop`, () => {
    test.beforeEach(({ page }) => {
      test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
    });

    test.describe("on a series", () => {
      test.use({ backend: seriesOn(look.platform) });

      test("rounds Sort, Tags, Mark read and Continue the platform's way", async ({
        page,
      }) => {
        await openSeries(page);
        const buttons = desktopSeriesButtons(page);

        const corners = await measureEach(buttons, cornerOf);

        expect(corners).toEqual(eachOf(buttons, look.corner));
      });
    });

    test.describe("in the reader", () => {
      test.use({ backend: readerOn(look.platform) });

      test("rounds the direction button's start the platform's way", async ({
        page,
      }) => {
        await openBook(page);
        await expect(directionButton(page)).toBeVisible();

        const corner = await cornerOf(directionButton(page));

        expect(corner).toBe(look.corner);
      });

      test.describe("for a first book", () => {
        test.use({ hasSeenReaderGuide: false });

        test("rounds the guide's Got it the platform's way", async ({
          page,
        }) => {
          await openBook(page);
          await expect(guideDone(page)).toBeVisible();

          const corner = await cornerOf(guideDone(page));

          expect(corner).toBe(look.corner);
        });
      });

      test("rounds Up next's Read and Back to the series the platform's way", async ({
        page,
      }) => {
        await openUpNext(page);
        const buttons = upNextButtons(page);

        const corners = await measureEach(buttons, cornerOf);

        expect(corners).toEqual(eachOf(buttons, look.corner));
      });
    });
  });
}

test.describe("on a desktop", () => {
  test.use({ backend: withSeries("linux") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
  });

  test("rounds About's Copy button to 10px", async ({ page }) => {
    await page.goto("/settings/about");

    const copyCorner = await cornerOf(
      page.getByRole("button", { name: "Copy version details" }),
    );

    expect(copyCorner).toBe(BUTTON_CORNER);
  });

  test("keeps navigation rows at 8px", async ({ page }) => {
    await page.goto("/settings/library");

    const destination = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Browse" });
    const section = page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name: "Appearance" });

    expect(await cornerOf(destination)).toBe(ROW_CORNER);
    expect(await cornerOf(section)).toBe(ROW_CORNER);
  });

  test("draws the library heading's View options 36px tall", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(viewOptionsButton(page)).toBeVisible();

    const view = await boxOf(viewOptionsButton(page));

    expect(view.height).toBe(PAGE_BUTTON_HEIGHT);
  });

  test("titles the View panel at 17px with a 1.3 line height", async ({
    page,
  }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);
    const title = panel.getByRole("heading", { name: "View options" });

    const lineHeight = await title.evaluate(
      (element) => getComputedStyle(element).lineHeight,
    );

    await expect(title).toHaveCSS("font-size", PANEL_TITLE_SIZE);
    expect(parseFloat(lineHeight)).toBeCloseTo(PANEL_TITLE_LINE_HEIGHT, 1);
  });

  test("draws the View panel's displays as 32px segments in an 8px track", async ({
    page,
  }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);
    const track = displayTrack(panel);
    const grid = displaySegment(panel, "Grid");

    expect((await boxOf(grid)).height).toBe(DESKTOP_SEGMENT_HEIGHT);
    expect((await boxOf(track)).height).toBe(DESKTOP_SEGMENT_TRACK_HEIGHT);
    expect(await cornerOf(track)).toBe(DESKTOP_SEGMENT_TRACK_CORNER);
    expect(await cornerOf(grid)).toBe(DESKTOP_SEGMENT_CORNER);
    await expect(grid).toHaveCSS("font-size", DESKTOP_SEGMENT_TEXT);
  });

  test("keeps the View panel's stepper at 8px", async ({ page }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);
    await panel.getByRole("radio", { name: "Choose" }).click();
    const stepper = panel.getByRole("group", {
      name: "Covers per row, chosen",
    });

    expect(await cornerOf(stepper)).toBe(DESKTOP_STEPPER_CORNER);
  });

  test("rounds keyboard keys to 6px", async ({ page }) => {
    await page.goto("/settings/privacy/screenshot-mode");

    const key = page.locator("kbd").first();

    expect(await cornerOf(key)).toBe(KEY_CORNER);
  });
});

test.describe("on an Android phone", () => {
  testOnlyInItsWebview("android");
  test.use(onPlatform("android"));

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("draws the empty library's Add a folder as a 48px pill", async ({
    page,
  }) => {
    await page.goto("/");
    const button = emptyStateAddFolder(page);

    const box = await boxOf(button);

    expect(box.height).toBe(PHONE_SECTION_BUTTON_HEIGHT);
    expect(await isPill(button)).toBe(true);
  });

  test("draws the Folders card's Add a folder as a slim 44px pill", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const button = addFolderInFolders(page);

    const box = await boxOf(button);
    const corner = await cornerOf(button);

    expect(box.height).toBe(FOLDERS_BUTTON_HEIGHT);
    expect(parseFloat(corner)).toBeGreaterThanOrEqual(box.height / 2);
  });

  test.describe("with series", () => {
    test.use({ backend: withSeries("android") });

    test("rounds the View sheet's top corners to 28px", async ({ page }) => {
      await page.goto("/");

      const panel = await openViewOptions(page);

      expect(await cornerOf(panel)).toBe(SHEET_CORNER);
    });

    test("draws the View sheet's displays as 40px segments in a 10px track", async ({
      page,
    }) => {
      await page.goto("/");

      const panel = await openViewOptions(page);
      const track = displayTrack(panel);
      const grid = displaySegment(panel, "Grid");

      expect((await boxOf(grid)).height).toBe(PHONE_SEGMENT_HEIGHT);
      expect((await boxOf(track)).height).toBe(PHONE_SEGMENT_TRACK_HEIGHT);
      expect(await cornerOf(track)).toBe(PHONE_SEGMENT_TRACK_CORNER);
      expect(await cornerOf(grid)).toBe(PHONE_SEGMENT_CORNER);
      await expect(grid).toHaveCSS("font-size", PHONE_SEGMENT_TEXT);
    });
  });

  test.describe("on a series", () => {
    test.use({ backend: seriesOn("android") });

    test("draws Find a book, Sort, Tags, Mark read, Details and Continue as pills", async ({
      page,
    }) => {
      await openSeries(page);
      const buttons = phoneSeriesButtons(page);

      const pills = await measureEach(buttons, isPill);

      expect(pills).toEqual(eachOf(buttons, true));
    });
  });

  test.describe("in the reader", () => {
    test.use({ backend: readerOn("android") });

    test("draws the direction button with a pill start", async ({ page }) => {
      await openBook(page);
      await expect(directionButton(page)).toBeVisible();

      const isPillStart = await isPill(directionButton(page));

      expect(isPillStart).toBe(true);
    });

    test.describe("for a first book", () => {
      test.use({ hasSeenReaderGuide: false });

      test("draws the guide's Got it as a pill", async ({ page }) => {
        await openBook(page);
        await expect(guideDone(page)).toBeVisible();

        const isGotItPill = await isPill(guideDone(page));

        expect(isGotItPill).toBe(true);
      });
    });

    test("draws Up next's Read and Back to the series as pills", async ({
      page,
    }) => {
      await openUpNext(page);
      const buttons = upNextButtons(page);

      const pills = await measureEach(buttons, isPill);

      expect(pills).toEqual(eachOf(buttons, true));
    });
  });
});

test.describe("on an iPhone", () => {
  testOnlyInItsWebview("ios");
  test.use(onPlatform("ios"));

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("draws the empty library's Add a folder 50px tall with 14px corners", async ({
    page,
  }) => {
    await page.goto("/");
    const button = emptyStateAddFolder(page);

    const box = await boxOf(button);

    expect(box.height).toBe(IOS_BUTTON_HEIGHT);
    expect(await cornerOf(button)).toBe(IOS_BUTTON_CORNER);
  });

  test("draws the Folders card's Add a folder as a pill", async ({ page }) => {
    await page.goto("/settings/library");
    const button = addFolderInFolders(page);

    const box = await boxOf(button);
    const corner = await cornerOf(button);

    expect(parseFloat(corner)).toBeGreaterThanOrEqual(box.height / 2);
  });
});
