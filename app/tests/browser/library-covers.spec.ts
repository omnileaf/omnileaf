import type { Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { type FakeBackend, fakeProtocolRoute } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  test,
} from "./fixtures.ts";

type WireSeries = Awaited<
  ReturnType<FakeBackend["librarySeries"]>
>["series"][number];

const BOOK = "0190a3e4-0000-8000-8000-000000000001";
const SERIES: readonly WireSeries[] = Array.from({ length: 7 }, (_, index) => ({
  id: `0190a3e4-0000-8000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
  title: `Sample Series ${String(index + 1).padStart(2, "0")}`,
  bookCount: index + 1,
  unreadCount: index + 1,
  cover: index === 6 ? null : `thumb/v1/${BOOK}/${String(index + 1)}/1`,
}));
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...SERIES], next: null }),
  },
});

test.beforeEach(async ({ page }) => {
  await page.route(fakeProtocolRoute("omni"), (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      headers: { "cache-control": "public, max-age=31536000, immutable" },
      body: COVER_IMAGE,
    }),
  );
});

function coversList(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("list", { name: "Series" });
}

test("shows each series' cover from the omni protocol", async ({ page }) => {
  await page.goto("/");

  const covers = coversList(page).getByRole("presentation");
  await expect(covers).toHaveCount(6);

  for (const cover of await covers.all()) {
    await cover.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        cover.evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await expect(covers.first()).toHaveAttribute(
    "src",
    new RegExp(`/__protocol__/omni/thumb/v1/${BOOK}/1/1$`),
  );
});

test("names each series and how many books it holds under its cover", async ({
  page,
}) => {
  await page.goto("/");

  const first = coversList(page).getByRole("listitem").first();

  await expect(first).toContainText("Sample Series 01");
  await expect(first).toContainText("1 book");
  await expect(
    page.getByRole("heading", { name: "Your library is empty" }),
  ).toHaveCount(0);
});

test("lays the covers out in as many columns as the screen's board draws", async ({
  page,
}) => {
  await page.goto("/");
  const items = coversList(page).getByRole("listitem");
  await expect(items).toHaveCount(SERIES.length);

  const tops = await Promise.all(
    (await items.all()).map(async (item) => (await boxOf(item)).y),
  );

  const firstRow = tops.filter((top) => top === tops[0]).length;
  expect(firstRow).toBe(DEFAULT_LIBRARY_VIEW.coversPerRow[screenSizeOf(page)]);
});

test("keeps every cover in the shape of a book cover", async ({ page }) => {
  await page.goto("/");
  const cover = coversList(page).getByRole("presentation").first();
  await expect(cover).toBeVisible();

  const box = await boxOf(cover);

  expect(box.height / box.width).toBeCloseTo(3 / 2, 1);
});

test("starts the covers at the reading direction's start in a right-to-left layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  const items = coversList(page).getByRole("listitem");
  await expect(items).toHaveCount(SERIES.length);

  const first = await boxOf(items.nth(0));
  const second = await boxOf(items.nth(1));

  expect(first.x).toBeGreaterThan(second.x);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the covers have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(coversList(page).getByRole("presentation")).toHaveCount(6);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
