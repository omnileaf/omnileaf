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
  EXPANDED_MIN_WIDTH,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";
import type { WireSeries } from "./series-catalog.ts";
import { viewOptionsButton } from "./view-options.ts";

const REAL_TITLE = "Hidden Story";
const SERIES_COUNT = 42;
const CENTRE_TOLERANCE = 1;
const STAND_IN = /Series \d{2,3}/;
const DISPLAYS: readonly LibraryDisplay[] = [
  "grid",
  "compact",
  "covers",
  "list",
];
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;
const SERIES: readonly WireSeries[] = [
  "3c9a5e1f-7b2d-8e40-a6c1-0d4f8b2e9a17",
  "e81b04d7-2c6f-8a93-b5d0-71fa3c8e2b46",
  "5f2d8a6c-91e3-8b07-8c4a-e6b13d0f7259",
  "a07c3e9b-4d18-8f62-9e2b-58c0a1d6f3e8",
  "16e4b7f0-c5a2-8d39-a8f1-2b9e6c3d0a75",
].map((id, index) => ({
  id,
  title: `${REAL_TITLE} ${String(index + 1)}`,
  bookCount: index + 2,
  unreadCount: index + 1,
  cover: `thumb/v1/${id}/1/1`,
}));

let catalog: readonly WireSeries[] = SERIES;
let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;
let coverRequests = 0;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...catalog], next: null }),
    librarySeriesCount: () => SERIES_COUNT,
    libraryView: () => storedView,
    setLibraryView: (view) => {
      storedView = view;
      return null;
    },
  },
});

test.beforeEach(async ({ page }) => {
  catalog = SERIES;
  storedView = { ...DEFAULT_LIBRARY_VIEW, showsItemCounts: true };
  coverRequests = 0;
  await page.route(fakeProtocolRoute("omni"), (route) => {
    coverRequests += 1;
    return route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE });
  });
});

function seriesItems(page: Page): Locator {
  return page.getByRole("list", { name: "Series" }).getByRole("listitem");
}

async function turnOnScreenshotMode(page: Page): Promise<void> {
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Control+Shift+H");
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();
}

async function openLibrary(page: Page, display: LibraryDisplay): Promise<void> {
  storedView = { ...storedView, display };
  await page.goto("/");
  await expect(seriesItems(page)).toHaveCount(catalog.length);
}

async function standInOf(item: Locator): Promise<string> {
  const text = (await item.textContent()) ?? "";
  const standIn = STAND_IN.exec(text);
  if (standIn === null) {
    throw new Error(`no stand-in name in "${text}"`);
  }
  return standIn[0];
}

for (const display of DISPLAYS) {
  test(`the ${display} display shows a stand-in for every title and asks for no cover while it's on`, async ({
    page,
  }) => {
    await turnOnScreenshotMode(page);

    await openLibrary(page, display);

    for (const item of await seriesItems(page).all()) {
      await expect(item).toContainText(STAND_IN);
    }
    expect(await page.content()).not.toContain(REAL_TITLE);
    await expect(seriesItems(page).getByRole("presentation")).toHaveCount(0);
    expect(coverRequests).toBe(0);
  });

  test(`the ${display} display shows real titles and covers while it's off`, async ({
    page,
  }) => {
    await openLibrary(page, display);

    await expect(seriesItems(page).first()).toContainText(`${REAL_TITLE} 1`);
    await expect(seriesItems(page).getByRole("presentation")).toHaveCount(
      SERIES.length,
    );
    await expect.poll(() => coverRequests).toBeGreaterThan(0);
  });
}

test("a series keeps its stand-in after switching display and reloading", async ({
  page,
}) => {
  await turnOnScreenshotMode(page);
  await openLibrary(page, "grid");
  const inGrid = await standInOf(seriesItems(page).nth(2));

  await openLibrary(page, "list");
  const inList = await standInOf(seriesItems(page).nth(2));
  await page.reload();
  await expect(seriesItems(page)).toHaveCount(SERIES.length);
  const reloaded = await standInOf(seriesItems(page).nth(2));

  expect([inList, reloaded]).toEqual([inGrid, inGrid]);
});

test("a series' stand-in comes from the series, not its place in the list", async ({
  page,
}) => {
  await turnOnScreenshotMode(page);
  await openLibrary(page, "grid");
  const third = await standInOf(seriesItems(page).nth(2));

  catalog = SERIES.slice(1);
  await openLibrary(page, "grid");

  expect(await standInOf(seriesItems(page).nth(1))).toBe(third);
});

test("the series count stays real while it's on", async ({ page }) => {
  await turnOnScreenshotMode(page);

  await openLibrary(page, "grid");

  await expect(
    page.getByRole("main").getByText(String(SERIES_COUNT), { exact: true }),
  ).toBeVisible();
});

test.describe("the label", () => {
  function label(page: Page): Locator {
    return page.getByRole("main").getByText("Screenshot mode", { exact: true });
  }

  function count(page: Page): Locator {
    return page
      .getByRole("main")
      .getByText(String(SERIES_COUNT), { exact: true });
  }

  test("follows the title and the count on one row on a wide screen", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "wide screens only");
    await turnOnScreenshotMode(page);
    await openLibrary(page, "grid");

    const title = await boxOf(page.getByRole("heading", { level: 1 }));
    const number = await boxOf(count(page));
    const pill = await boxOf(label(page));

    expect(number.x).toBeGreaterThanOrEqual(title.x + title.width);
    expect(pill.x).toBeGreaterThanOrEqual(number.x + number.width);
    expect(
      Math.abs(pill.y + pill.height / 2 - (title.y + title.height / 2)),
    ).toBeLessThanOrEqual(CENTRE_TOLERANCE);
  });

  test("sits on its own row under the heading on a narrower screen", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "narrower screens only",
    );
    await turnOnScreenshotMode(page);
    await openLibrary(page, "grid");

    const title = await boxOf(page.getByRole("heading", { level: 1 }));
    const number = await boxOf(count(page));
    const options = await boxOf(viewOptionsButton(page));
    const pill = await boxOf(label(page));

    expect(number.x).toBeGreaterThanOrEqual(title.x + title.width);
    expect(pill.y).toBeGreaterThanOrEqual(
      Math.max(title.y + title.height, options.y + options.height),
    );
  });

  for (const isOn of [true, false]) {
    test(`leaves the buttons on the title's row with it ${isOn ? "on" : "off"}`, async ({
      page,
    }) => {
      if (isOn) {
        await turnOnScreenshotMode(page);
      }
      await openLibrary(page, "grid");

      const title = await boxOf(page.getByRole("heading", { level: 1 }));
      const options = await boxOf(viewOptionsButton(page));

      expect(options.y).toBeLessThan(title.y + title.height);
      expect(options.y + options.height).toBeGreaterThan(title.y);
    });
  }
});
