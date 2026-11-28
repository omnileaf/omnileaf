import type { CDPSession, Locator, Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  selectByLongPress,
  test,
  tokenColour,
} from "./fixtures.ts";
import { touch } from "./library-frames.ts";
import { chapters, SectionShelf, volumes } from "./series-sections-shelf.ts";
import { SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const PICKED_COVER_OPACITY = "0.76";
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const FINGER_ID = 1;
const LONGEST_PRESS_MS = 800;
const MARK_FAILED = "Couldn't mark those books. Try again.";

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

function coverLink(page: Page, index: number): Locator {
  return cover(page, index).getByRole("link").first();
}

function pickedCount(page: Page): Locator {
  return contextualBar(page).getByRole("heading", { level: 2 });
}

async function holdFirstCover(page: Page): Promise<void> {
  await openSeries(page);
  await selectByLongPress(page, cover(page, 0));
}

async function holdByFinger(page: Page, target: Locator): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  const box = await boxOf(target);
  const finger = {
    id: FINGER_ID,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await page.clock.install();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await page.clock.runFor(LONGEST_PRESS_MS);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  return session;
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

    test("moves focus to the count, which says it, once a cover is held", async ({
      page,
    }) => {
      await holdFirstCover(page);

      await expect(pickedCount(page)).toBeFocused();
      await expect(pickedCount(page)).toHaveText("1 selected");
      await expect(pickedCount(page)).toHaveAttribute("aria-live", "polite");
    });

    test("says the count once after Select all", async ({ page }) => {
      await holdFirstCover(page);

      await contextualBar(page)
        .getByRole("button", { name: "Select all" })
        .click();

      await expect(pickedCount(page)).toHaveText("3 selected");
      await expect(pickedCount(page)).toHaveAttribute("aria-live", "polite");
      await expect(page.getByRole("main").getByRole("status")).toHaveText("");
    });

    test("starts picking from a cover held by a finger", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "touch through DevTools");
      await openSeries(page);

      await holdByFinger(page, coverLink(page, 0));

      await expect(pickBox(page, "Volume 1")).toBeChecked();
      await expect(pickBox(page, "Volume 2")).not.toBeChecked();
      await expect(pickedCount(page)).toHaveText("1 selected");
    });

    test("adds a second cover tapped by a finger", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "touch through DevTools");
      await openSeries(page);
      const session = await holdByFinger(page, coverLink(page, 0));

      await touch(session, pickBox(page, "Volume 3"));

      await expect(pickBox(page, "Volume 1")).toBeChecked();
      await expect(pickBox(page, "Volume 3")).toBeChecked();
      await expect(pickedCount(page)).toHaveText("2 selected");
    });

    test("ends picking on Escape from a keyboard", async ({ page }) => {
      await holdFirstCover(page);

      await page.keyboard.press("Escape");

      await expect(pickBox(page, "Volume 1")).toHaveCount(0);
      await expect(contextualBar(page)).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
    });

    test("puts focus back on the held cover once picking is closed", async ({
      page,
    }) => {
      await holdFirstCover(page);

      await contextualBar(page)
        .getByRole("button", { name: "Clear the selection" })
        .click();

      await expect(coverLink(page, 0)).toBeFocused();
    });

    test("puts focus on the cover last unticked once none is left", async ({
      page,
    }) => {
      await holdFirstCover(page);
      await pickBox(page, "Volume 3").click();
      await pickBox(page, "Volume 1").click();

      await pickBox(page, "Volume 3").click();

      await expect(contextualBar(page)).toHaveCount(0);
      await expect(coverLink(page, 2)).toBeFocused();
    });

    test("puts focus on the cover last picked once marking ends picking", async ({
      page,
    }) => {
      await holdFirstCover(page);
      await pickBox(page, "Volume 2").click();

      await pickedActions(page)
        .getByRole("button", { name: "Mark read" })
        .click();

      await expect(contextualBar(page)).toHaveCount(0);
      await expect(coverLink(page, 1)).toBeFocused();
    });

    test("ends picking once the last cover is unticked at a wider width and the phone is narrow again", async ({
      page,
    }) => {
      shelf = new SectionShelf([...volumes(1, 2, 3), ...chapters(1, 2)]);
      await holdFirstCover(page);
      await page.setViewportSize(TABLET);
      await pickBox(page, "Volume 1").click();

      await page.setViewportSize(PHONE);

      await expect(contextualBar(page)).toHaveCount(0);
      await expect(pickBox(page, "Volume 1")).toHaveCount(0);
      await expect(navigation(page)).toBeVisible();
    });

    test.describe("when marking the picked books fails", () => {
      test.use({
        backend: {
          ...DEFAULT_BACKEND,
          seriesOverview: (id) => shelf.backend().seriesOverview(id),
          seriesBooks: (id, listing, after) =>
            shelf.backend().seriesBooks(id, listing, after),
          markBooks: () => {
            throw new CommandFailure({
              code: "internal",
              message: "something went wrong inside the app",
            });
          },
        },
      });

      test("says so in a notice clear of the docked toolbar and keeps the covers picked", async ({
        page,
      }) => {
        await holdFirstCover(page);

        await pickedActions(page)
          .getByRole("button", { name: "Mark read" })
          .click();

        const failure = page
          .getByRole("region", { name: /^Notifications/u })
          .getByText(MARK_FAILED);
        await expect(failure).toBeVisible();
        await expect(async () => {
          const line = await boxOf(failure);
          const toolbar = await boxOf(pickedActions(page));
          expect(line.y + line.height).toBeLessThanOrEqual(toolbar.y);
        }).toPass({ timeout: 5_000 });
        await expect(pickBox(page, "Volume 1")).toBeChecked();
        await expect(pickedCount(page)).toHaveText("1 selected");
      });
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
