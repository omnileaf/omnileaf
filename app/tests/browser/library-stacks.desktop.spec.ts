import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

type WireSeries = Awaited<
  ReturnType<FakeBackend["librarySeries"]>
>["series"][number];

function series(number: number, bookCount: number): WireSeries {
  return {
    id: `0190a3e4-0000-8000-8000-0000000000${String(number).padStart(2, "0")}`,
    title: `Sample Series ${String(number).padStart(2, "0")}`,
    bookCount,
    unreadCount: bookCount,
    cover: null,
    language: null,
    hasDownloads: false,
    isAdult: false,
    continuesFrom: null,
  };
}

const LIBRARY: readonly WireSeries[] = [
  series(1, 12),
  series(4, 20),
  series(5, 1),
];

function libraryOf(stacks: boolean): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    libraryView: () => ({
      ...DEFAULT_LIBRARY_VIEW,
      stacksSeriesCovers: stacks,
    }),
  };
}

function tileOf(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

function sheetsOf(tile: Locator): Locator {
  return tile.locator('[data-slot="cover-sheet"]');
}

async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the locator drew nothing");
  }
  return box.y;
}

test.describe("with stacked covers on, as they start", () => {
  test.use({ backend: libraryOf(true) });

  test("draws two sheets behind each series of many books", async ({
    page,
  }) => {
    await page.goto("/");

    const stacked = tileOf(page, "Sample Series 04");
    await expect(sheetsOf(stacked)).toHaveCount(2);
    for (const sheet of await sheetsOf(stacked).all()) {
      await expect(sheet).toBeVisible();
    }
  });

  test("keeps a one-shot a single cover, level with the stacks", async ({
    page,
  }) => {
    await page.goto("/");

    const oneShot = tileOf(page, "Sample Series 05");
    const stacked = tileOf(page, "Sample Series 01");
    await expect(sheetsOf(oneShot)).toHaveCount(0);
    expect(await topOf(oneShot.getByRole("img", { name: "1 unread" }))).toBe(
      await topOf(stacked.getByRole("img", { name: "12 unread" })),
    );
  });

  test("keeps the sheets out of the accessibility tree", async ({ page }) => {
    await page.goto("/");
    await expect(sheetsOf(tileOf(page, "Sample Series 01"))).toHaveCount(2);

    expect(await accessibilityViolations(page)).toEqual([]);
    await expect(tileOf(page, "Sample Series 01")).toMatchAriaSnapshot(`
      - listitem:
        - link /Sample Series 01/
    `);
  });
});

test.describe("with stacked covers switched off", () => {
  test.use({ backend: libraryOf(false) });

  test("draws every series as a flat cover", async ({ page }) => {
    await page.goto("/");
    await expect(tileOf(page, "Sample Series 04")).toBeVisible();

    await expect(page.locator('[data-slot="cover-sheet"]')).toHaveCount(0);
  });
});
