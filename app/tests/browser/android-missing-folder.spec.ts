import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";

let missing: MissingFolder[] = [];
let asked: string[] = [];

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
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
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
  },
);
