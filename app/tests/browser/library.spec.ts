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
  type WireSeries,
} from "./series-catalog.ts";

const EMPTY_ICON_SIZE = { phone: 28, wider: 36 } as const;
const LIBRARY_CHANGED = "library-changed";
const ROW_LIMIT_FOR_A_SCREEN = 120;
const PAGES_A_SCREEN_NEEDS = 2;

function emptyLibrary(page: Page): Locator {
  return page.getByRole("region", { name: "Your library is empty" });
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

test("opens on the empty library", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Omnileaf");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Your library is empty" }),
  ).toBeVisible();
});

test("offers Add a folder beside the empty library's title", async ({
  page,
}) => {
  await page.goto("/");
  const addFolder = page.getByRole("button", { name: "Add a folder" });

  const title = await boxOf(
    page.getByRole("heading", { level: 1, name: "Library" }),
  );
  const headerButton = await boxOf(addFolder.first());

  await expect(addFolder).toHaveCount(2);
  await expect(
    emptyLibrary(page).getByRole("button", { name: "Add a folder" }),
  ).toBeVisible();
  expect(headerButton.x).toBeGreaterThan(title.x);
  expect(headerButton.y).toBeLessThan(title.y + title.height);
  expect(headerButton.y + headerButton.height).toBeGreaterThan(title.y);
});

test("draws the empty library's art at the size the boards draw it", async ({
  page,
}) => {
  await page.goto("/");
  const isPhone = viewportOf(page).width < MEDIUM_MIN_WIDTH;

  const icon = await boxOf(emptyLibrary(page).locator("svg").first());

  expect(icon.width).toBe(
    isPhone ? EMPTY_ICON_SIZE.phone : EMPTY_ICON_SIZE.wider,
  );
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
    catalog = sampleSeries(500);
    pagesAsked = 0;
  });

  async function scrollToTheEnd(page: Page): Promise<void> {
    await page.getByRole("main").evaluate((main) => {
      main.scrollTo({ top: main.scrollHeight });
    });
  }

  test("reads only the first pages the screen needs", async ({ page }) => {
    await page.goto("/");

    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();
    expect(pagesAsked).toBeLessThanOrEqual(PAGES_A_SCREEN_NEEDS);
  });

  test("reads further pages as the list scrolls, as far as its last series", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      seriesList(page).getByText("Sample Series 0001"),
    ).toBeVisible();
    const last = seriesList(page).getByText("Sample Series 0500");

    await expect(async () => {
      await scrollToTheEnd(page);
      await expect(last).toBeVisible({ timeout: 100 });
    }).toPass();

    expect(pagesAsked).toBe(10);
  });

  test("lays out only the rows near the screen however far the list goes", async ({
    page,
  }) => {
    await page.goto("/");
    const last = seriesList(page).getByText("Sample Series 0500");
    await expect(async () => {
      await scrollToTheEnd(page);
      await expect(last).toBeVisible({ timeout: 100 });
    }).toPass();

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
      "Sample Series 0500",
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
    const last = seriesList(page).getByText("Sample Series 0500");
    await expect(async () => {
      await scrollToTheEnd(page);
      await expect(last).toBeVisible({ timeout: 100 });
    }).toPass();

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect.poll(() => pagesAsked).toBe(20);
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
