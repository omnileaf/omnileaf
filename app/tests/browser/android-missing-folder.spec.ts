import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LONG_PRESS_MS = 600;
const AWAY_COUNT = 2;
const CONNECTED = sampleSeries(4, AWAY_COUNT + 1);
const AWAY = sampleSeries(AWAY_COUNT).map((series) => ({
  ...series,
  bookCount: 4,
  unreadCount: 3,
  isConnected: false,
}));
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";

let missing: MissingFolder[] = [];
let asked: string[] = [];

function listed() {
  return missing.some((one) => one.isShownAnyway)
    ? [CONNECTED[0], ...AWAY, ...CONNECTED.slice(1)]
    : CONNECTED;
}

function comicsGone(): MissingFolder {
  return {
    folder: {
      id: FOLDER_ID,
      kind: "linked",
      name: "Comics",
      location: "/media/Comics",
      isAvailable: false,
    },
    problem: { kind: "missing" },
    hiddenSeries: 41,
    isShownAnyway: false,
  } as MissingFolder;
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(listed),
    librarySeriesCount: () => listed().length,
    missingLibraryFolders: () => missing,
    libraryHiddenSeriesCount: () =>
      missing.some((one) => !one.isShownAnyway) ? 41 : 0,
    showMissingLibraryFolder: (id, isShown) => {
      asked.push(`show ${id} ${String(isShown)}`);
      missing = missing.map((one) => ({ ...one, isShownAnyway: isShown }));
      return null;
    },
    libraryFolderBookCount: () => 41,
  },
});

test.beforeEach(() => {
  missing = [comicsGone()];
  asked = [];
});

test.describe(
  "a missing folder on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's inline card");
    });

    test("sits at the top of the library as a card, not over the covers", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("status").filter({
        hasText: "Comics isn’t there",
      });
      const covers = page.getByRole("list", { name: "Series" });

      await expect(card).toContainText(
        "41 series are hidden until it’s back. Your reading progress is safe.",
      );
      expect(
        (await boxOf(card)).y + (await boxOf(card)).height,
      ).toBeLessThanOrEqual((await boxOf(covers)).y);
      await expect(card.locator("[data-slot=alert]")).toHaveCSS(
        "border-top-left-radius",
        "12px",
      );
    });

    test("offers Show them anyway and Find the folder as text buttons, and a Dismiss", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("status").filter({
        hasText: "Comics isn’t there",
      });

      for (const name of ["Show them anyway", "Find the folder"]) {
        const button = card.getByRole("button", { name });
        await expect(button).toBeVisible();
        await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(button).toHaveCSS("border-top-width", "0px");
      }
      await expect(card.getByRole("button", { name: "Dismiss" })).toBeVisible();
      const show = await boxOf(
        card.getByRole("button", { name: "Show them anyway" }),
      );
      const find = await boxOf(
        card.getByRole("button", { name: "Find the folder" }),
      );
      expect(show.y).toBeCloseTo(find.y, 0);
      expect(find.x).toBeGreaterThan(show.x + show.width - 1);
    });

    test("says the series are shown but can't be opened once they are shown anyway, offering to hide them again", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("status").filter({
        hasText: "Comics isn’t there",
      });

      await card.getByRole("button", { name: "Show them anyway" }).click();

      await expect(card).toContainText(
        "41 series from it are shown, but can’t be opened until it’s back.",
      );
      expect(asked).toEqual([`show ${FOLDER_ID} true`]);
      const find = await boxOf(
        card.getByRole("button", { name: "Find the folder" }),
      );
      const hide = await boxOf(
        card.getByRole("button", { name: "Hide them again" }),
      );
      expect(find.x).toBeLessThan(hide.x);
      await card.getByRole("button", { name: "Hide them again" }).click();
      await expect(card).toContainText("41 series are hidden until it’s back.");
      expect(asked).toEqual([
        `show ${FOLDER_ID} true`,
        `show ${FOLDER_ID} false`,
      ]);
    });

    test("stays gone for the rest of the visit once dismissed", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("status").filter({
        hasText: "Comics isn’t there",
      });

      await card.getByRole("button", { name: "Dismiss" }).click();

      await expect(card).toHaveCount(0);
    });

    test.describe("once they are shown anyway", () => {
      const AWAY_TITLE = AWAY[0]?.title ?? "";
      const CONNECTED_TITLE = CONNECTED[0]?.title ?? "";
      const LAST_CONNECTED_TITLE = CONNECTED.at(-1)?.title ?? "";
      const NOT_CONNECTED_OPACITY = "0.38";

      test.beforeEach(() => {
        missing = [{ ...comicsGone(), isShownAnyway: true }];
      });

      function tileOf(page: Page, title: string): Locator {
        return page
          .getByRole("list", { name: "Series" })
          .getByRole("listitem")
          .filter({ hasText: title });
      }

      test("marks each one Not connected and dims its cover, badge and progress", async ({
        page,
      }) => {
        await page.goto("/");
        const tile = tileOf(page, AWAY_TITLE);

        await expect(tile.getByText("Not connected")).toBeVisible();
        await expect(tile.locator("[data-slot=cover-dim]")).toHaveCSS(
          "opacity",
          NOT_CONNECTED_OPACITY,
        );
        await expect(tile.getByRole("progressbar")).toHaveCSS(
          "opacity",
          NOT_CONNECTED_OPACITY,
        );
        await expect(
          tile
            .locator("[data-slot=cover-dim]")
            .getByRole("img", { name: "3 unread" }),
        ).toBeVisible();
        await expect(tile.locator("[data-slot=not-connected]")).not.toHaveCSS(
          "opacity",
          NOT_CONNECTED_OPACITY,
        );
        await expect(tile.getByText(AWAY_TITLE)).not.toHaveCSS(
          "opacity",
          "0.38",
        );
      });

      test("leaves a series from a folder that is there as it was", async ({
        page,
      }) => {
        await page.goto("/");
        const tile = tileOf(page, CONNECTED_TITLE);

        await expect(tile.getByText("Not connected")).toHaveCount(0);
        await expect(tile.locator("[data-slot=cover-dim]")).toHaveCount(0);
        await expect(tile.getByRole("link")).toHaveCount(1);
      });

      test("cannot be opened, and says it is not connected", async ({
        page,
      }) => {
        await page.goto("/");
        const tile = tileOf(page, AWAY_TITLE);

        await expect(tile.getByRole("link")).toHaveCount(0);
        const group = tile.getByRole("group", {
          name: `${AWAY_TITLE}, not connected`,
        });
        await expect(group).toHaveAttribute("aria-disabled", "true");
        await group.click({ force: true });
        await expect(page).toHaveURL(/\/$/);
      });

      test("cannot be picked by a range from one series to another past them", async ({
        page,
      }) => {
        await page.goto("/");
        const link = tileOf(page, CONNECTED_TITLE).getByRole("link");
        const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
        await link.dispatchEvent("pointerdown", touch);
        await page.waitForTimeout(LONG_PRESS_MS);
        await page
          .getByRole("checkbox", { name: CONNECTED_TITLE })
          .dispatchEvent("pointerup", touch);

        await page
          .getByRole("checkbox", { name: LAST_CONNECTED_TITLE })
          .click({ modifiers: ["Shift"] });

        await expect(
          page.getByText(`${String(CONNECTED.length)} selected`).first(),
        ).toBeVisible();
      });

      test("cannot be picked, by a long press or Select all", async ({
        page,
      }) => {
        await page.goto("/");
        const link = tileOf(page, CONNECTED_TITLE).getByRole("link");
        const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
        await link.dispatchEvent("pointerdown", touch);
        await page.waitForTimeout(LONG_PRESS_MS);
        await page
          .getByRole("checkbox", { name: CONNECTED_TITLE })
          .dispatchEvent("pointerup", touch);
        await page.getByRole("button", { name: "Select all" }).click();

        await expect(
          page.getByText(`${String(CONNECTED.length)} selected`).first(),
        ).toBeVisible();
        await expect(
          tileOf(page, AWAY_TITLE).getByRole("checkbox"),
        ).toHaveCount(0);
      });
    });
  },
);
