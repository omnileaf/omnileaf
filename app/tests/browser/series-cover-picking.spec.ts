import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  selectByLongPress,
  test,
  tokenColour,
} from "./fixtures.ts";
import { SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const PICKED_COVER_OPACITY = "0.76";

let shelf = new SectionShelf([]);

test.beforeEach(() => {
  shelf = new SectionShelf(volumes(1, 2, 3));
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    markBooks: (books, mark) => shelf.backend().markBooks(books, mark),
  },
});

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await expect(covers(page).getByRole("listitem")).toHaveCount(3);
}

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Volumes" });
}

function cover(page: Page, index: number): Locator {
  return covers(page).getByRole("listitem").nth(index);
}

function pickBox(page: Page, name: string): Locator {
  return covers(page).getByRole("checkbox", { name, exact: true });
}

function contextualBar(page: Page): Locator {
  return page.locator("[data-picking-bar]");
}

function pickedActions(page: Page): Locator {
  return page.getByRole("group", { name: "Selected books" });
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

async function holdFirstCover(page: Page): Promise<void> {
  await openSeries(page);
  await selectByLongPress(page, cover(page, 0));
}

test.describe(
  "picking a series' covers on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's contextual bar");
    });

    test("puts close, the count and Select all in the contextual bar once a cover is held", async ({
      page,
    }) => {
      await holdFirstCover(page);

      const bar = contextualBar(page);
      await expect(bar.getByRole("button")).toHaveCount(2);
      await expect(bar.getByRole("button").first()).toHaveAccessibleName(
        "Clear the selection",
      );
      await expect(bar.getByRole("button").last()).toHaveText("Select all");
      await expect(
        bar.getByRole("heading", { level: 2, name: "1 selected" }),
      ).toBeVisible();
    });

    test("swaps the navigation bar for the docked Mark read and Mark unread", async ({
      page,
    }) => {
      await holdFirstCover(page);

      await expect(navigation(page)).toBeHidden();
      const actions = pickedActions(page).getByRole("button");
      await expect(actions).toHaveCount(2);
      await expect(actions.first()).toHaveAccessibleName("Mark read");
      await expect(actions.last()).toHaveAccessibleName("Mark unread");
      await expect(page.locator("kbd")).toHaveCount(0);
    });

    test("frames the held cover in the accent, dimmed, with no check box on any cover", async ({
      page,
    }) => {
      await holdFirstCover(page);

      await expect(pickBox(page, "Volume 1")).toBeChecked();
      const accent = await tokenColour(page, "--native-color-cover-accent");
      const frameOf = (index: number) =>
        cover(page, index)
          .getByRole("checkbox")
          .evaluate(
            (tile) => getComputedStyle(tile, "::before").backgroundColor,
          );
      expect(await frameOf(0)).toBe(accent);
      expect(await frameOf(1)).not.toBe(accent);
      await expect(
        cover(page, 0).locator("[data-pickable-link] > span").first(),
      ).toHaveCSS("opacity", PICKED_COVER_OPACITY);
      await expect(
        covers(page).locator('[data-slot="selection-mark"]'),
      ).toHaveCount(0);
    });

    test("adds a second cover tapped while picking", async ({ page }) => {
      await holdFirstCover(page);

      await pickBox(page, "Volume 3").click();

      await expect(pickBox(page, "Volume 3")).toBeChecked();
      await expect(pickBox(page, "Volume 2")).not.toBeChecked();
      await expect(
        contextualBar(page).getByRole("heading", { name: "2 selected" }),
      ).toBeVisible();
    });

    test("ends picking from the contextual bar's close", async ({ page }) => {
      await holdFirstCover(page);

      await contextualBar(page)
        .getByRole("button", { name: "Clear the selection" })
        .click();

      await expect(pickBox(page, "Volume 1")).toHaveCount(0);
      await expect(contextualBar(page)).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
    });

    test("ends picking on Android's back and stays on the series", async ({
      page,
    }) => {
      await page.goto("/");
      await holdFirstCover(page);
      const series = page.url();

      await page.goBack();

      await expect(pickBox(page, "Volume 1")).toHaveCount(0);
      await expect(contextualBar(page)).toHaveCount(0);
      expect(page.url()).toBe(series);
    });

    test("ends picking once the last cover is unticked", async ({ page }) => {
      await holdFirstCover(page);

      await pickBox(page, "Volume 1").click();

      await expect(pickBox(page, "Volume 1")).toHaveCount(0);
      await expect(contextualBar(page)).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
    });

    test("picks every cover from Select all", async ({ page }) => {
      await holdFirstCover(page);

      await contextualBar(page)
        .getByRole("button", { name: "Select all" })
        .click();

      await expect(
        contextualBar(page).getByRole("heading", { name: "3 selected" }),
      ).toBeVisible();
      await expect(covers(page).getByRole("checkbox")).toHaveCount(3);
      for (const box of await covers(page).getByRole("checkbox").all()) {
        await expect(box).toBeChecked();
      }
    });

    test("marks the picked books read from the docked toolbar and ends picking", async ({
      page,
    }) => {
      await holdFirstCover(page);
      await pickBox(page, "Volume 2").click();

      await pickedActions(page)
        .getByRole("button", { name: "Mark read" })
        .click();

      await expect(contextualBar(page)).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
      expect(shelf.marked).toHaveLength(1);
      expect(shelf.marked[0]?.mark).toBe("read");
      expect(shelf.marked[0]?.books).toHaveLength(2);
    });
  },
);
