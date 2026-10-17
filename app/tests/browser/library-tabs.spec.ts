import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const COUNTS: Record<string, number> = { reading: 6, manga: 64, comics: 41 };
const FIRST_TABS: readonly LibraryTab[] = [
  { id: { kind: "all" }, isHidden: false },
  { id: { kind: "newChapters" }, isHidden: true },
];

let saved: LibraryTab[] | undefined;
let created: readonly string[] = [];

function backendKeepingLabels(keepsLabels: boolean): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [
      ...CATEGORIES,
      ...created.map((name) => ({ id: name, name })),
    ],
    categorySeriesCount: (category) => COUNTS[category] ?? 0,
    libraryTabs: () => saved ?? [...FIRST_TABS],
    setLibraryTabs: (tabs) => {
      saved = tabs as LibraryTab[];
      return null;
    },
    seriesLabels: () => ({
      keepsLabels,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
    labelSeries: (_series, changes) => {
      created = [...created, ...changes.categoriesCreated];
      return null;
    },
  };
}

test.beforeEach(() => {
  saved = undefined;
  created = [];
});

function tabList(page: Page): Locator {
  return page.getByRole("list", { name: "Library tabs" });
}

function rowOf(page: Page, name: string): Locator {
  return tabList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

async function openMenuOf(page: Page, name: string): Promise<Locator> {
  await rowOf(page, name)
    .getByRole("button", { name: `More for ${name}` })
    .click();
  return page.getByRole("menu");
}

function savedOrder(): string[] | undefined {
  return saved?.map(({ id, isHidden }) => {
    const name = id.kind === "category" ? id.id : id.kind;
    return isHidden ? `${name} (hidden)` : name;
  });
}

test.describe("in a library that keeps labels", () => {
  test.use({ backend: backendKeepingLabels(true) });

  test("lists every tab, built in or a category, saying which are hidden", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");

    await expect(tabList(page).getByRole("listitem")).toHaveCount(5);
    await expect(rowOf(page, "All")).toContainText(
      "Always shown; can’t be hidden",
    );
    await expect(rowOf(page, "New chapters")).toContainText("Hidden");
    await expect(rowOf(page, "Manga")).toContainText("Category · 64 series");
  });

  test("moves a tab down from its menu, and keeps the order", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");

    const menu = await openMenuOf(page, "Reading");
    await menu.getByRole("menuitem", { name: "Move down" }).click();

    await expect(tabList(page).getByRole("listitem")).toHaveText([
      /All/,
      /New chapters/,
      /Manga/,
      /Reading/,
      /Comics/,
    ]);
    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "reading", "comics"]);
  });

  test("shows a hidden tab and hides a shown one", async ({ page }) => {
    await page.goto("/settings/library/tabs");

    await (
      await openMenuOf(page, "New chapters")
    )
      .getByRole("menuitem", { name: "Show this tab" })
      .click();
    await (
      await openMenuOf(page, "Comics")
    )
      .getByRole("menuitem", { name: "Hide this tab" })
      .click();

    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters", "reading", "manga", "comics (hidden)"]);
  });

  test("offers no way to hide All", async ({ page }) => {
    await page.goto("/settings/library/tabs");

    const menu = await openMenuOf(page, "All");

    await expect(menu.getByRole("menuitem")).toHaveText([
      "Move up",
      "Move down",
    ]);
  });

  test("moves a tab with Alt and the arrow keys, saying where it went", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");

    await rowOf(page, "Manga")
      .getByRole("button", { name: "Move Manga" })
      .press("Alt+ArrowUp");

    await expect(page.getByRole("status")).toContainText(
      "Manga moved up, to position 3 of 5",
    );
    await expect(
      rowOf(page, "Manga").getByRole("button", { name: "Move Manga" }),
    ).toBeFocused();
    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "reading", "comics"]);
  });

  test("moves a tab dragged by its handle", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Comics").getByRole("button", {
      name: "Move Comics",
    });
    const target = await rowOf(page, "New chapters").boundingBox();
    const start = await handle.boundingBox();
    if (target === null || start === null) {
      throw new Error("the tabs are not on screen");
    }

    await page.mouse.move(
      start.x + start.width / 2,
      start.y + start.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, target.y + 4, {
      steps: 8,
    });
    await page.mouse.up();

    await expect
      .poll(savedOrder)
      .toEqual(["all", "comics", "newChapters (hidden)", "reading", "manga"]);
  });

  test("makes a new category, which joins the tabs at the end", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");

    await page.getByRole("button", { name: "New category" }).click();
    const dialog = page.getByRole("dialog", { name: "New category" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Seinen");
    await dialog.getByRole("button", { name: "Add" }).click();

    await expect(tabList(page).getByRole("listitem").last()).toContainText(
      "Seinen",
    );
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    await expect(tabList(page)).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe("in a library that keeps no labels", () => {
  test.use({ backend: backendKeepingLabels(false) });

  test("offers no new category", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    await expect(tabList(page)).toBeVisible();

    await expect(
      page.getByRole("button", { name: "New category" }),
    ).toHaveCount(0);
  });
});

test("says what Library tabs holds in Settings › Library", async ({ page }) => {
  await page.goto("/settings/library");

  await expect(page.getByRole("link", { name: /^Library tabs/ })).toContainText(
    "Order, hidden tabs, where the library opens",
  );
});

test("opens Library tabs from Settings › Library", async ({ page }) => {
  await page.goto("/settings/library");

  await page.getByRole("link", { name: /^Library tabs/ }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library tabs" }),
  ).toBeVisible();
});
