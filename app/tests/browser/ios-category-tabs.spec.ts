import type { Locator, Page } from "@playwright/test";

import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const MANGA = LIBRARY.slice(0, 4);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const TAB_HEIGHT_PX = 28;
const BAR_BUTTON_PX = 44;

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  libraryCategories: () => [...CATEGORIES],
  categorySeries: (_category, after, listing) =>
    pagedSeries(() => MANGA)(after, listing),
  categorySeriesCount: () => MANGA.length,
};

test.use({ backend: BACKEND });

function tabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Categories" });
}

function sheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Categories" });
}

async function openSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Every category" }).click();
  await expect(sheet(page)).toBeVisible();
  await settle(sheet(page));
}

test.describe("the category tabs on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(async ({ page, platform }) => {
    test.skip(platform !== "ios", "iOS's capsules");
    await page.goto("/");
    await expect(tabs(page)).toBeVisible();
  });

  test("draws each tab as a capsule, the chosen one tinted green", async ({
    page,
  }) => {
    const chosen = tabs(page).getByRole("tab", { name: "All" });
    const other = tabs(page).getByRole("tab", { name: "Manga" });

    await expect(chosen).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-accent-soft"),
    );
    await expect(other).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-outline"),
    );
    expect((await boxOf(chosen)).height).toBeCloseTo(TAB_HEIGHT_PX, 0);
    await expect(chosen).toHaveCSS("border-bottom-width", "0px");
    const isRound = await chosen.evaluate(
      (tab) =>
        parseFloat(getComputedStyle(tab).borderTopLeftRadius) >=
        tab.clientHeight / 2,
    );
    expect(isRound).toBe(true);
  });

  test("draws the chevron as a round 28px face inside a 44px target", async ({
    page,
  }) => {
    const chevron = page.getByRole("button", { name: "Every category" });
    const face = chevron.locator("span").first();

    const target = await boxOf(chevron);
    expect(target.width).toBeGreaterThanOrEqual(BAR_BUTTON_PX);
    expect(target.height).toBeGreaterThanOrEqual(BAR_BUTTON_PX);
    await expect(face).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-outline"),
    );
    const drawn = await boxOf(face);
    expect(drawn.width).toBeCloseTo(TAB_HEIGHT_PX, 0);
    expect(drawn.height).toBeCloseTo(TAB_HEIGHT_PX, 0);
  });

  test("lists every tab in a grouped sheet, with Edit in its bar and the chosen one ticked", async ({
    page,
  }) => {
    await openSheet(page);

    const close = await boxOf(
      sheet(page).getByRole("button", { name: "Close", exact: true }),
    );
    const edit = await boxOf(
      sheet(page).getByRole("button", { name: "Edit", exact: true }),
    );
    const title = await boxOf(
      sheet(page).getByRole("heading", { name: "Categories" }),
    );
    expect(close.height).toBeCloseTo(BAR_BUTTON_PX, 0);
    expect(close.x).toBeLessThan(title.x);
    expect(title.x).toBeLessThan(edit.x);
    const list = sheet(page).getByRole("radiogroup");
    await expect(list).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-card"),
    );
    await expect(
      sheet(page).getByRole("radio", { name: "All" }),
    ).toHaveAttribute("aria-checked", "true");
    const row = await boxOf(sheet(page).getByRole("radio", { name: "All" }));
    expect(row.height).toBeCloseTo(52, 0);
  });

  test("moves to the tab picked in the sheet and closes it", async ({
    page,
  }) => {
    await openSheet(page);

    await sheet(page).getByRole("radio", { name: "Comics" }).click();

    await expect(sheet(page)).toBeHidden();
    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("offers New category as a row under the list", async ({ page }) => {
    await openSheet(page);

    const list = await boxOf(sheet(page).getByRole("radiogroup"));
    const add = await boxOf(
      sheet(page).getByRole("button", { name: "New category" }),
    );
    expect(add.y).toBeGreaterThan(list.y + list.height);
  });
});
