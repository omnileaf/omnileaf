import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { emitFakeEvent } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  pagedSeries,
  sampleSeries,
  SERIES_PER_PAGE,
  type WireSeries,
} from "./series-catalog.ts";

const LIBRARY_CHANGED = "library-changed";
const EMPTY_TEXT_MEASURE = 440;
const PHONE_EMPTY_TEXT_INSET = 40;
const ROW_LIMIT_FOR_A_SCREEN = 120;
const PAGES_A_SCREEN_NEEDS = 1;
const SERIES_IN_CATALOG = 500;
const PAGES_IN_CATALOG = SERIES_IN_CATALOG / SERIES_PER_PAGE;
const LAST_SERIES = `Sample Series ${String(SERIES_IN_CATALOG).padStart(4, "0")}`;
const SCROLL_RETRY_MS = 100;
const PHONE_EMPTY_ART = { art: 64, icon: 28 };
const WIDE_EMPTY_ART = { art: 80, icon: 36 };

function emptyLibrary(page: Page): Locator {
  return page.getByRole("region", { name: "Your library is empty" });
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function isWide(page: Page): boolean {
  return viewportOf(page).width >= MEDIUM_MIN_WIDTH;
}

test.describe("with an empty library", () => {
  test("opens on the empty library", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Omnileaf");
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await expect(
      emptyLibrary(page).getByRole("heading", {
        level: 2,
        name: "Your library is empty",
      }),
    ).toBeVisible();
    await expect(
      emptyLibrary(page).getByText(
        "Add a folder of comics, manga or books. Omnileaf reads it where it is.",
      ),
    ).toBeVisible();
  });

  test("offers to add a folder beside the title and in the empty state", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator("main header").getByRole("button", { name: "Add a folder" }),
    ).toBeVisible();
    await expect(
      emptyLibrary(page).getByRole("button", { name: "Add a folder" }),
    ).toBeVisible();
  });

  test("draws the empty state's art at the size its board does", async ({
    page,
  }) => {
    await page.goto("/");
    const icon = emptyLibrary(page).locator("svg").first();
    await expect(icon).toBeVisible();

    const art = await boxOf(icon.locator(".."));
    const shape = await boxOf(icon);

    const board = isWide(page) ? WIDE_EMPTY_ART : PHONE_EMPTY_ART;
    expect(art.width).toBe(board.art);
    expect(art.height).toBe(board.art);
    expect(shape.width).toBe(board.icon);
  });

  test("keeps the empty state's help to the board's measure", async ({
    page,
  }) => {
    await page.goto("/");
    const help = emptyLibrary(page).getByText(
      "Add a folder of comics, manga or books.",
    );
    await expect(help).toBeVisible();

    const box = await boxOf(help);

    if (isWide(page)) {
      expect(box.width).toBeLessThanOrEqual(EMPTY_TEXT_MEASURE);
    } else {
      expect(box.x).toBeGreaterThanOrEqual(PHONE_EMPTY_TEXT_INSET);
      expect(box.x + box.width).toBeLessThanOrEqual(
        viewportOf(page).width - PHONE_EMPTY_TEXT_INSET,
      );
    }
  });

  test("centres the empty state across the page", async ({ page }) => {
    await page.goto("/");
    const title = emptyLibrary(page).getByRole("heading", { level: 2 });
    await expect(title).toBeVisible();

    const main = await boxOf(page.getByRole("main"));
    const box = await boxOf(title);

    expect(box.x + box.width / 2).toBeCloseTo(main.x + main.width / 2, -1);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the empty library has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await expect(emptyLibrary(page)).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});

let catalog: readonly WireSeries[] = [];
let pagesAsked = 0;

test.describe("with a library of many series", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: (after) => {
        pagesAsked += 1;
        return pagedSeries(() => catalog)(after);
      },
    },
  });

  test.beforeEach(() => {
    catalog = sampleSeries(SERIES_IN_CATALOG);
    pagesAsked = 0;
  });

  async function scrollToTheLastSeries(page: Page): Promise<Locator> {
    const last = seriesList(page).getByText(LAST_SERIES);
    await expect(async () => {
      await page.getByRole("main").evaluate((main) => {
        main.scrollTo({ top: main.scrollHeight });
      });
      await expect(last).toBeVisible({ timeout: SCROLL_RETRY_MS });
    }).toPass({ intervals: [SCROLL_RETRY_MS] });
    return last;
  }

  test("reads only the first page the screen needs", async ({ page }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();

    await page.evaluate(
      () =>
        new Promise((painted) => {
          requestAnimationFrame(() => requestAnimationFrame(painted));
        }),
    );

    expect(pagesAsked).toBe(PAGES_A_SCREEN_NEEDS);
  });

  test("reads further pages as the list scrolls, as far as its last series", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();

    await scrollToTheLastSeries(page);

    expect(pagesAsked).toBe(PAGES_IN_CATALOG);
  });

  test("lays out only the rows near the screen however far the list goes", async ({
    page,
  }) => {
    await page.goto("/");
    await scrollToTheLastSeries(page);

    const laidOut = await seriesList(page).getByRole("listitem").count();

    expect(laidOut).toBeLessThan(ROW_LIMIT_FOR_A_SCREEN);
    await expect(seriesList(page).getByText("Sample Series 0001")).toHaveCount(
      0,
    );
  });

  test("shows the series a scan adds once the library says it changed", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();
    catalog = [...sampleSeries(1, 0), ...catalog];

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(seriesList(page).getByRole("listitem").first()).toContainText(
      "Sample Series 0000",
    );
  });

  test("puts the series in their new order once the library says it changed", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();
    catalog = catalog.toReversed();

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(seriesList(page).getByRole("listitem").first()).toContainText(
      LAST_SERIES,
    );
  });

  test("shows the empty library once its last folder goes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();
    catalog = [];

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(emptyLibrary(page)).toBeVisible();
    await expect(seriesList(page)).toHaveCount(0);
  });

  test("keeps the place in a long list when the library changes", async ({
    page,
  }) => {
    await page.goto("/");
    const last = await scrollToTheLastSeries(page);

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect.poll(() => pagesAsked).toBe(2 * PAGES_IN_CATALOG);
    await expect(last).toBeVisible();
  });

  test("tells assistive technology each series' place in the library", async ({
    page,
  }) => {
    await page.goto("/");

    const first = seriesList(page).getByRole("listitem").first();

    await expect(first).toHaveAttribute("aria-posinset", "1");
    await expect(first).toHaveAttribute("aria-setsize", "-1");
  });
});
