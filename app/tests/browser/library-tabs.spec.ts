import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
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

const DRAG_STEPS = 8;
const DRAGGED_PAST_THE_LIST = 80;

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

  test("sets a tab dragged past the end of the list down in the last place, no longer lifted", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = rowOf(page, "Reading");
    const start = await boxOf(
      row.getByRole("button", { name: "Move Reading" }),
    );
    const list = await boxOf(tabList(page));
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, list.y + list.height + DRAGGED_PAST_THE_LIST, {
      steps: DRAG_STEPS,
    });
    await page.mouse.move(
      x + DRAGGED_PAST_THE_LIST,
      list.y + list.height + DRAGGED_PAST_THE_LIST * 2,
    );
    await page.mouse.up();

    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "comics", "reading"]);
    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
  });

  test("keeps the lifted row inside the list however far it is dragged", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = rowOf(page, "Reading");
    const start = await boxOf(
      row.getByRole("button", { name: "Move Reading" }),
    );
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, start.y + DRAGGED_PAST_THE_LIST * 10, {
      steps: DRAG_STEPS,
    });
    const list = await boxOf(tabList(page));
    const lifted = await boxOf(row);
    await page.mouse.up();

    expect(lifted.y + lifted.height).toBeLessThanOrEqual(
      list.y + list.height + 1,
    );
  });

  test("slides the other rows out of the way while a tab is dragged, keeping their order until it drops", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const mangaAtRest = await boxOf(rowOf(page, "Manga"));
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, mangaAtRest.y + mangaAtRest.height - 2, {
      steps: DRAG_STEPS,
    });

    await expect(rowOf(page, "Manga")).not.toHaveCSS("translate", "none");
    await expect
      .poll(async () => (await boxOf(rowOf(page, "Manga"))).y)
      .toBeLessThan(mangaAtRest.y - 1);
    await expect(tabList(page).getByRole("listitem")).toHaveText([
      /All/,
      /New chapters/,
      /Reading/,
      /Manga/,
      /Comics/,
    ]);
    await page.mouse.up();
    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "reading", "comics"]);
  });

  test("puts a tab back where it was when its drag is cancelled", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, start.y + start.height * 2, { steps: DRAG_STEPS });
    await handle.dispatchEvent("pointercancel");

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    await expect(rowOf(page, "Manga")).toHaveCSS("translate", "none");
    expect(saved).toBeUndefined();
    await page.mouse.up();
  });

  test("puts a dragged tab back when the app goes to the background", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, start.y + start.height * 2, { steps: DRAG_STEPS });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    expect(saved).toBeUndefined();
    await page.mouse.up();
  });

  test("swaps the rows without sliding when motion is reduced", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, start.y + start.height, { steps: DRAG_STEPS });

    await expect(rowOf(page, "Manga")).toHaveCSS("transition-duration", "0s");
    await page.mouse.up();
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

test.describe("in a narrow desktop window", () => {
  test.use({
    backend: backendKeepingLabels(true),
    viewport: { width: 360, height: 800 },
  });
  test.skip(({ isMobile }) => isMobile, "only a desktop window narrows");

  test("puts where the library opens above its choice", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    const label = page.getByText("The library opens on", { exact: true });
    const choice = page.getByRole("combobox", {
      name: "The library opens on",
    });

    const labelBox = await boxOf(label);
    const choiceBox = await boxOf(choice);

    expect(choiceBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height);
    expect(
      await label.evaluate((shown) => shown.scrollWidth - shown.clientWidth),
    ).toBe(0);
  });
});

test("says what Library tabs holds in Settings > Library", async ({ page }) => {
  await page.goto("/settings/library");

  await expect(page.getByRole("link", { name: /^Library tabs/ })).toContainText(
    "Order, hidden tabs, where the library opens",
  );
});

test("opens Library tabs from Settings > Library", async ({ page }) => {
  await page.goto("/settings/library");

  await page.getByRole("link", { name: /^Library tabs/ }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library tabs" }),
  ).toBeVisible();
});
