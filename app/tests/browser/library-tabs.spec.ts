import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  heldAnimations,
  holdScriptedAnimations,
  slowMoves,
} from "./held-animations.ts";
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
const MOVE_MS = 300;
const SECOND_POINTER = 7;
const SHORT_WINDOW = { width: 800, height: 420 };
const POINTER_NUDGE = 2;
const INSIDE_THE_ROW = 2;
const SECOND_POINTER_TRAVEL = 100;
const SCROLLED = 40;
const STARTING_ORDER = [/All/, /New chapters/, /Reading/, /Manga/, /Comics/];
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

async function bottomOfRow(page: Page, name: string): Promise<number> {
  const row = await boxOf(rowOf(page, name));
  return row.y + row.height - INSIDE_THE_ROW;
}

function middleOf({ y, height }: { y: number; height: number }): number {
  return y + height / 2;
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
      steps: DRAG_STEPS,
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

    expect(
      Math.abs(lifted.y + lifted.height - (list.y + list.height)),
    ).toBeLessThanOrEqual(1);
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
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
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
    await handle.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    await expect(rowOf(page, "Manga")).toHaveCSS("translate", "none");
    await expect(tabList(page).getByRole("listitem")).toHaveText(
      STARTING_ORDER,
    );
    expect(saved).toBeUndefined();
  });

  test("measures a new drag from where the rows rest while a cancelled drag still eases them back", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const reading = rowOf(page, "Reading");
    const all = await boxOf(rowOf(page, "All"));
    const readingAtRest = await boxOf(reading);
    const mangaAtRest = await boxOf(rowOf(page, "Manga"));
    const between =
      (middleOf(readingAtRest) + middleOf(mangaAtRest)) / 2 -
      (all.y + all.height);
    const start = await boxOf(
      reading.getByRole("button", { name: "Move Reading" }),
    );
    const handle = await boxOf(
      rowOf(page, "All").getByRole("button", { name: "Move All" }),
    );
    const x = start.x + start.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    await expect
      .poll(async () => (await boxOf(rowOf(page, "Manga"))).y)
      .toBeCloseTo(readingAtRest.y, 0);
    await slowMoves(page);
    await reading
      .getByRole("button", { name: "Move Reading" })
      .dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + between, { steps: DRAG_STEPS });
    await page.mouse.up();

    await expect
      .poll(savedOrder)
      .toEqual(["newChapters (hidden)", "reading", "all", "manga", "comics"]);
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
    await page.mouse.up();

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    await expect(tabList(page).getByRole("listitem")).toHaveText(
      STARTING_ORDER,
    );
    expect(saved).toBeUndefined();
  });

  test("puts a dragged tab back when the window loses focus", async ({
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
      window.dispatchEvent(new Event("blur"));
    });
    await page.mouse.up();

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    await expect(tabList(page).getByRole("listitem")).toHaveText(
      STARTING_ORDER,
    );
    expect(saved).toBeUndefined();
  });

  test("sets a tab down in its last gap when the release happened outside the window", async ({
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
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    await handle.dispatchEvent("pointermove", {
      pointerId: 1,
      buttons: 0,
      clientY: start.y,
    });

    await expect(rowOf(page, "Reading")).toHaveCSS("box-shadow", "none");
    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "reading", "comics"]);
  });

  test("swaps the rows without sliding when motion is reduced", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await holdScriptedAnimations(page);
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const readingAtRest = await boxOf(rowOf(page, "Reading"));
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    const manga = await boxOf(rowOf(page, "Manga"));

    expect(manga.y).toBeCloseTo(readingAtRest.y, 0);
    await page.mouse.up();
    await expect.poll(savedOrder).toBeDefined();

    expect(await heldAnimations(page)).toEqual([]);
  });

  test("eases a dropped tab into its gap over the kit's move time", async ({
    page,
  }) => {
    await holdScriptedAnimations(page);
    await page.goto("/settings/library/tabs");
    const handle = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const start = await boxOf(handle);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    await page.mouse.up();

    await expect
      .poll(async () =>
        (await heldAnimations(page)).map(({ duration }) => duration),
      )
      .toEqual([MOVE_MS]);
  });

  test("fades a dropped tab's shadow while it settles", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    await slowMoves(page);
    const row = rowOf(page, "Reading");
    const start = await boxOf(
      row.getByRole("button", { name: "Move Reading" }),
    );
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    const lifted = await row.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );
    await page.mouse.up();
    const shadows = await row.evaluate((element) => {
      const settles = element.getAnimations();
      for (const settle of settles) {
        settle.pause();
        settle.currentTime = 0;
      }
      const start = getComputedStyle(element).boxShadow;
      for (const settle of settles) {
        settle.finish();
      }
      return { start, end: getComputedStyle(element).boxShadow };
    });

    expect(lifted).not.toBe("none");
    expect(shadows).toEqual({ start: lifted, end: "none" });
  });

  test("sets a dropped tab down flat even when its settle can't animate", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Element.prototype.animate = () => {
        throw new DOMException("no animations here", "NotSupportedError");
      };
    });
    await page.goto("/settings/library/tabs");
    const row = rowOf(page, "Reading");
    const start = await boxOf(
      row.getByRole("button", { name: "Move Reading" }),
    );
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    await page.mouse.up();

    await expect.poll(savedOrder).toBeDefined();
    await expect(row).toHaveCSS("z-index", "auto");
  });

  test("leaves a drag to the pointer that started it", async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.setPointerCapture = () => undefined;
    });
    await page.goto("/settings/library/tabs");
    const reading = rowOf(page, "Reading").getByRole("button", {
      name: "Move Reading",
    });
    const comics = rowOf(page, "Comics").getByRole("button", {
      name: "Move Comics",
    });
    const start = await boxOf(reading);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await comics.dispatchEvent("pointerdown", {
      pointerId: SECOND_POINTER,
      button: 0,
      isPrimary: false,
    });
    await page.mouse.move(x, await bottomOfRow(page, "Manga"), {
      steps: DRAG_STEPS,
    });
    const lifted = await boxOf(rowOf(page, "Reading"));
    await comics.dispatchEvent("pointermove", {
      pointerId: SECOND_POINTER,
      clientY: start.y - SECOND_POINTER_TRAVEL,
    });
    await comics.dispatchEvent("pointerup", { pointerId: SECOND_POINTER });

    await expect(rowOf(page, "Reading")).not.toHaveCSS("box-shadow", "none");
    await expect(rowOf(page, "Comics")).toHaveCSS("box-shadow", "none");
    expect((await boxOf(rowOf(page, "Reading"))).y).toBe(lifted.y);
    await page.mouse.up();

    await expect
      .poll(savedOrder)
      .toEqual(["all", "newChapters (hidden)", "manga", "reading", "comics"]);
  });

  test("keeps the lifted row under the pointer when the page scrolls mid-drag", async ({
    page,
  }) => {
    await page.setViewportSize(SHORT_WINDOW);
    await page.goto("/settings/library/tabs");
    const row = rowOf(page, "Reading");
    const start = await boxOf(
      row.getByRole("button", { name: "Move Reading" }),
    );
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + POINTER_NUDGE, { steps: DRAG_STEPS });
    const before = await boxOf(row);
    const scrolled = await page.getByRole("main").evaluate((main, by) => {
      main.scrollBy(0, by);
      return main.scrollTop;
    }, SCROLLED);
    await page.mouse.move(x, y, { steps: DRAG_STEPS });
    const after = await boxOf(row);
    await page.mouse.up();

    expect(scrolled).toBe(SCROLLED);
    expect(after.y).toBeCloseTo(before.y - POINTER_NUDGE, 0);
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

  test("sets New category as a row at the end of the tabs, as wide as them", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const add = page.getByRole("button", { name: /^New category/ });
    const lastRow = tabList(page).getByRole("listitem").last();

    const addBox = await boxOf(add);
    const rowBox = await boxOf(lastRow);

    expect(addBox.x).toBe(rowBox.x);
    expect(addBox.width).toBe(rowBox.width);
    expect(addBox.height).toBe(rowBox.height);
    expect(addBox.y).toBe(rowBox.y + rowBox.height + 1);
    await expect(tabList(page)).toHaveCSS("border-bottom-width", "1px");
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
