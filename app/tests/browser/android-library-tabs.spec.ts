import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  heldAnimations,
  holdScriptedAnimations,
  slowMoves,
} from "./held-animations.ts";

const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
] as LibraryCategory[];
const DRAG_STEPS = 8;
const PART_OF_A_ROW = 20;
const INSIDE_THE_ROW = 2;
const SHORT_OF_HALF = 3;
const TABS: readonly LibraryTab[] = [
  { id: { kind: "all" }, isHidden: false },
  { id: { kind: "newChapters" }, isHidden: true },
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [...CATEGORIES],
    categorySeriesCount: () => 6,
    libraryTabs: () => [...TABS],
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
  },
});

function tabList(page: Page): Locator {
  return page.getByRole("list", { name: "Library tabs" });
}

function rowOf(page: Page, name: string): Locator {
  return tabList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

test.describe("Library tabs on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("lists the tabs flat, no card and no rules between rows", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const list = page.getByRole("list", { name: "Library tabs" });
    const row = list.getByRole("listitem").filter({ hasText: "Reading" });

    await expect(list).toHaveCSS("border-top-width", "0px");
    await expect(list).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(row).toHaveCSS("border-top-width", "0px");
  });

  test("sets each row at 72px with a 16px name over a 14px line, the handle and More as 40px buttons", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const list = page.getByRole("list", { name: "Library tabs" });
    const row = list.getByRole("listitem").filter({ hasText: "Reading" });
    const name = row.getByText("Reading", { exact: true });
    const detail = row.getByText("Category · 6 series");
    const handle = row.getByRole("button", { name: /^Move Reading/ });
    const more = row.getByRole("button", { name: "More for Reading" });

    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(72);
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("line-height", "24px");
    await expect(name).toHaveCSS("font-weight", "400");
    await expect(detail).toHaveCSS("font-size", "14px");
    await expect(detail).toHaveCSS("line-height", "20px");
    expect(await boxOf(handle)).toMatchObject({ width: 40, height: 40 });
    expect(await boxOf(more)).toMatchObject({ width: 40, height: 40 });
    expect((await boxOf(handle)).x - (await boxOf(row)).x).toBeCloseTo(4, 0);
  });

  test("shows More as three dots one above the other", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    const more = page
      .getByRole("listitem")
      .filter({ hasText: "Reading" })
      .getByRole("button", { name: "More for Reading" });

    await expect(more.locator("[data-icon=ellipsis]")).toBeVisible();
    await expect(more.locator("svg")).toHaveCount(0);
  });

  test("sets New category as a full-width row after the tabs, the plus where the handles sit", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const add = page.getByRole("button", { name: "New category" });
    const lastRow = page
      .getByRole("list", { name: "Library tabs" })
      .getByRole("listitem")
      .last();
    const handle = lastRow.getByRole("button", { name: /^Move / });
    const plus = add.locator("[data-icon=plus]");

    const addBox = await boxOf(add);
    const rowBox = await boxOf(lastRow);
    const handleBox = await boxOf(handle);
    const plusBox = await boxOf(plus);

    expect(addBox.x).toBe(rowBox.x);
    expect(addBox.width).toBe(rowBox.width);
    expect(addBox.height).toBe(rowBox.height);
    expect(addBox.y).toBeCloseTo(rowBox.y + rowBox.height, 0);
    expect(plusBox.x + plusBox.width / 2).toBeCloseTo(
      handleBox.x + handleBox.width / 2,
      0,
    );
    await expect(add).toHaveCSS("border-top-width", "0px");
    await expect(add).toHaveCSS("border-radius", "0px");
    await expect(add.getByText("New category")).toHaveCSS("font-size", "16px");
  });

  test("sets the Hidden badge without a border and the note at 14px", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const badge = page
      .getByRole("listitem")
      .filter({ hasText: "New chapters" })
      .getByText("Hidden", { exact: true });
    const note = page
      .locator("p")
      .filter({ hasText: "Drag to reorder. Hiding a tab" });

    await expect(badge).toHaveCSS("border-top-width", "0px");
    await expect(badge).toHaveCSS("border-top-left-radius", "8px");
    expect((await boxOf(badge)).height).toBe(24);
    await expect(note).toHaveCSS("font-size", "14px");
    await expect(note).toHaveCSS("line-height", "20px");
    await expect(note).toHaveCSS("padding-left", "16px");
  });

  test("sets where the library opens as a two-line row that opens a choice dialog", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = page.getByRole("button", { name: /^The library opens on/ });

    await expect(row).toContainText("The tab used last");
    await expect(row).toHaveAttribute("aria-haspopup", "dialog");
    await row.click();
    const dialog = page.getByRole("dialog", { name: "The library opens on" });
    await expect(dialog.getByRole("radio")).toHaveCount(4);
    await dialog.getByRole("radio", { name: "Reading" }).click();

    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Reading");
  });

  test("lifts the row a little off the page while it is dragged, no wider than the screen, then sets it down", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    const row = page.getByRole("listitem").filter({ hasText: "Reading" });
    const handle = row.getByRole("button", { name: /^Move Reading/ });
    const box = await boxOf(handle);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20);

    await expect(row).toHaveCSS("translate", "0px -6px");
    await expect(row).not.toHaveCSS("box-shadow", "none");
    await expect(row).toHaveCSS("scale", "none");
    await page.mouse.up();
    await expect(row).toHaveCSS("translate", "none");
  });

  test("settles a dropped row from where it was lifted to where it rests, with no jump at either end", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    await slowMoves(page);
    const row = rowOf(page, "Reading");
    const box = await boxOf(row.getByRole("button", { name: /^Move Reading/ }));
    const x = box.x + box.width / 2;

    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2 + PART_OF_A_ROW, {
      steps: DRAG_STEPS,
    });
    const lifted = await boxOf(row);
    await page.mouse.up();
    const ends = await row.evaluate((element) => {
      const settles = element.getAnimations();
      for (const settle of settles) {
        settle.pause();
        settle.currentTime = 0;
      }
      const start = element.getBoundingClientRect().y;
      for (const settle of settles) {
        settle.finish();
      }
      return { start, end: element.getBoundingClientRect().y };
    });
    await expect(row).toHaveCSS("box-shadow", "none");
    const rest = await boxOf(row);

    expect(ends.start).toBeCloseTo(lifted.y, 0);
    expect(ends.end).toBeCloseTo(rest.y, 0);
  });

  test("measures a new drag from the row's resting place while the last drop still settles", async ({
    page,
  }) => {
    await holdScriptedAnimations(page);
    await page.goto("/settings/library/tabs");
    await slowMoves(page);
    const row = rowOf(page, "Reading");
    const handle = row.getByRole("button", { name: /^Move Reading/ });
    const manga = await boxOf(rowOf(page, "Manga"));
    const start = await boxOf(handle);
    const x = start.x + start.width / 2;

    await page.mouse.move(x, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, manga.y + manga.height - INSIDE_THE_ROW, {
      steps: DRAG_STEPS,
    });
    await page.mouse.up();
    await expect.poll(async () => (await heldAnimations(page)).length).toBe(1);
    const settling = await boxOf(handle);
    const y = settling.y + settling.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - (manga.height / 2 - SHORT_OF_HALF), {
      steps: DRAG_STEPS,
    });
    await page.mouse.up();

    await expect(tabList(page).getByRole("listitem")).toHaveText([
      /All/,
      /New chapters/,
      /Manga/,
      /Reading/,
    ]);
  });
});
