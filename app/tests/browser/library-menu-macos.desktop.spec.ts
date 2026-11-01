import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);
const BOOK = "0190a3e4-0000-8000-8000-0000000b0001";

let shownInFolder: string[] = [];
let removed: string[][] = [];
let markedRead: string[][] = [];

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({
      series: LIBRARY.map((series, index) => ({
        ...series,
        continuesFrom: index === 0 ? BOOK : null,
      })),
      next: null,
    }),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
    markSeriesRead: (series) => {
      markedRead = [...markedRead, series];
      return [];
    },
    showSeriesInFolder: (series) => {
      shownInFolder = [...shownInFolder, series];
      return null;
    },
    previewRemoval: (targets) => ({
      books: targets.length,
      files: targets.length,
      folders: 1,
    }),
    removeFromLibrary: (targets) => {
      removed = [...removed, targets.map(({ id }) => id)];
      return { removedSeries: targets.length, removedBooks: 0, files: [] };
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  shownInFolder = [];
  removed = [];
  markedRead = [];
});

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
}

async function rightClick(page: Page, index: number): Promise<Locator> {
  await covers(page)
    .locator("[data-pickable-link]")
    .nth(index)
    .click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function pickFirstTwo(page: Page): Promise<void> {
  await covers(page)
    .getByRole("link")
    .nth(0)
    .click({ modifiers: ["Meta"] });
  await covers(page)
    .getByRole("checkbox")
    .nth(1)
    .click({ modifiers: ["Meta"] });
}

async function namesIn(menu: Locator): Promise<string[]> {
  const names = await menu.getByRole("menuitem").allTextContents();
  return names.map((name) => name.trim());
}

test("ends a series' menu with Show in Finder and Remove from library", async ({
  page,
}) => {
  await openLibrary(page);

  const menu = await rightClick(page, 1);

  expect((await namesIn(menu)).slice(-2)).toEqual([
    "Show in Finder",
    "Remove from library…",
  ]);
});

test("leaves Select out of a series' menu, since a click already selects", async ({
  page,
}) => {
  await openLibrary(page);

  const menu = await rightClick(page, 1);

  expect(await namesIn(menu)).not.toContain("Select");
});

test("rings the right-clicked cover in the accent", async ({ page }) => {
  await openLibrary(page);

  await rightClick(page, 1);

  const ring = await covers(page)
    .getByRole("link")
    .nth(1)
    .locator("> div")
    .first()
    .evaluate((cover) => {
      const { outlineColor, outlineWidth, outlineOffset } =
        getComputedStyle(cover);
      const probe = document.createElement("div");
      probe.style.color = "var(--color-accent)";
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { outlineColor, outlineWidth, outlineOffset, accent };
    });
  expect(ring.outlineColor).toBe(ring.accent);
  expect(ring.outlineWidth).toBe("3px");
  expect(ring.outlineOffset).toBe("2px");
});

test("offers no Rename or Share", async ({ page }) => {
  await openLibrary(page);

  const menu = await rightClick(page, 1);

  await expect(
    menu.getByRole("menuitem", { name: /Rename|Share/ }),
  ).toHaveCount(0);
});

test("draws Remove from library in the same colour as the other items, never red", async ({
  page,
}) => {
  await openLibrary(page);
  const menu = await rightClick(page, 1);

  const remove = menu.getByRole("menuitem", { name: "Remove from library…" });

  await expect(remove).toHaveCSS(
    "color",
    await menu
      .getByRole("menuitem", { name: "Show in Finder" })
      .evaluate((item) => getComputedStyle(item).color),
  );
});

test("shows the series in Finder", async ({ page }) => {
  await openLibrary(page);
  const menu = await rightClick(page, 1);

  await menu.getByRole("menuitem", { name: "Show in Finder" }).click();

  await expect.poll(() => shownInFolder).toEqual([LIBRARY[1]?.id]);
});

test("asks before removing the series from the library", async ({ page }) => {
  await openLibrary(page);
  const menu = await rightClick(page, 1);

  await menu.getByRole("menuitem", { name: "Remove from library…" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove", exact: true })
    .click();

  await expect.poll(() => removed).toEqual([[LIBRARY[1]?.id]]);
});

test.describe("with several series selected", () => {
  test("is Mark as read, Categories and tags, Show in Finder then Remove 2 series from library", async ({
    page,
  }) => {
    await openLibrary(page);
    await pickFirstTwo(page);

    const menu = await rightClick(page, 0);

    expect(await namesIn(menu)).toEqual([
      "Mark as read",
      "Categories and tags…",
      "Show in Finder",
      "Remove 2 series from library…",
    ]);
  });

  test("marks every selected series as read", async ({ page }) => {
    await openLibrary(page);
    await pickFirstTwo(page);
    const menu = await rightClick(page, 1);

    await menu.getByRole("menuitem", { name: "Mark as read" }).click();

    await expect
      .poll(() => markedRead)
      .toEqual([[LIBRARY[0]?.id, LIBRARY[1]?.id]]);
  });

  test("opens Categories and tags for the selection", async ({ page }) => {
    await openLibrary(page);
    await pickFirstTwo(page);
    const menu = await rightClick(page, 1);

    await menu.getByRole("menuitem", { name: "Categories and tags…" }).click();

    await expect(
      page.getByRole("dialog", { name: "Categories and tags" }),
    ).toBeVisible();
  });

  test("shows every selected series in Finder", async ({ page }) => {
    await openLibrary(page);
    await pickFirstTwo(page);
    const menu = await rightClick(page, 0);

    await menu.getByRole("menuitem", { name: "Show in Finder" }).click();

    await expect
      .poll(() => shownInFolder)
      .toEqual([LIBRARY[0]?.id, LIBRARY[1]?.id]);
  });

  test("removes every selected series after asking", async ({ page }) => {
    await openLibrary(page);
    await pickFirstTwo(page);
    const menu = await rightClick(page, 1);

    await menu
      .getByRole("menuitem", { name: "Remove 2 series from library…" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove", exact: true })
      .click();

    await expect
      .poll(() => removed)
      .toEqual([[LIBRARY[0]?.id, LIBRARY[1]?.id]]);
  });

  test("selects only the cover right-clicked when it was not selected, as Finder does", async ({
    page,
  }) => {
    await openLibrary(page);
    await pickFirstTwo(page);

    const menu = await rightClick(page, 3);

    expect((await namesIn(menu)).slice(-2)).toEqual([
      "Show in Finder",
      "Remove from library…",
    ]);
    await expect(
      covers(page).getByRole("checkbox", { checked: true }),
    ).toHaveCount(1);
    await expect(covers(page).getByRole("checkbox").nth(3)).toBeChecked();
    await menu.getByRole("menuitem", { name: "Remove from library…" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect.poll(() => removed).toEqual([[LIBRARY[3]?.id]]);
  });

  test("keeps the selection when the menu is dismissed", async ({ page }) => {
    await openLibrary(page);
    await pickFirstTwo(page);
    await rightClick(page, 0);

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      covers(page).getByRole("checkbox", { checked: true }),
    ).toHaveCount(2);
  });
});
