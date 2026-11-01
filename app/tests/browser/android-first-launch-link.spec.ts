import type { Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  setTextScale,
  sidewaysOverflow,
  test,
  tokenColour,
} from "./fixtures.ts";

type WireFolder = Awaited<
  ReturnType<FakeBackend["libraryFolders"]>
>["folders"][number];

const HOME: WireFolder = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "Internal storage › Documents › Omnileaf",
  isAvailable: true,
};

const LINK_HEADING = "Already have comics or books?";
const HERO_ICON_SIZE = 32;
const PLAIN_BUTTON_WEIGHT = "500";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

const COMICS: WireFolder = {
  id: "2",
  kind: "linked",
  name: "Comics",
  location: "Internal storage › Comics",
  isAvailable: true,
};
const MANGA: WireFolder = {
  id: "3",
  kind: "linked",
  name: "Manga",
  location: "SD card › Manga",
  isAvailable: true,
};
const LONG_PLACE =
  "SD card › Backups › Reading › Sample Comics From A Drive With A Long Name › Volumes";
const ROW_TITLE_SIZE = "16px";
const ROW_DETAIL_SIZE = "14px";
const REGULAR_WEIGHT = "400";
const SPINNER_SIZE = 16;
const LARGE_TEXT_SCALE = 1.3;
const BUTTON_LABEL_SIZE = 16;
const BUTTON_LABEL_WEIGHT = "500";

let linked: WireFolder[] = [HOME];
let endScan: () => void = () => undefined;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({ folders: [...linked], next: null }),
    libraryFolderBookCount: (id) => (id === MANGA.id ? 214 : 0),
    addLibraryFolder: async (onProgress) => {
      await onProgress.send({
        stage: "adding",
        name: COMICS.name,
        location: COMICS.location,
      });
      await onProgress.send({ stage: "finding", found: 38 });
      await new Promise<void>((resolve) => {
        endScan = resolve;
      });
      linked = [...linked, COMICS];
      return {
        name: COMICS.name,
        series: 3,
        books: 38,
        unreadableBooks: 0,
        unsupportedBooks: 0,
        unreadableFolders: 0,
      };
    },
  },
});

test.beforeEach(() => {
  linked = [HOME, MANGA];
  endScan = () => undefined;
});

test.afterEach(() => {
  endScan();
});

async function goToTheLinkStep(page: Page): Promise<void> {
  await page.goto("/first-launch");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: LINK_HEADING }),
  ).toBeVisible();
}

test.describe(
  "the link folders step on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's setup steps");
    });

    test("sets the step icon bare over the headline, in the accent, with no round badge", async ({
      page,
    }) => {
      await goToTheLinkStep(page);
      const hero = page
        .getByRole("heading", { level: 1, name: LINK_HEADING })
        .locator("xpath=preceding-sibling::*[1]");
      const icon = hero.locator("svg");

      const box = await icon.boundingBox();

      expect([box?.width, box?.height]).toEqual([
        HERO_ICON_SIZE,
        HERO_ICON_SIZE,
      ]);
      await expect(icon).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
      await expect(hero.locator("span").first()).toHaveCSS(
        "background-color",
        TRANSPARENT,
      );
    });

    test("sets Skip as a plain text button in the accent", async ({ page }) => {
      await goToTheLinkStep(page);
      const skip = page.getByRole("button", { name: /^Skip/ });

      await expect(skip).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
      await expect(skip).toHaveCSS("font-weight", PLAIN_BUTTON_WEIGHT);
      await expect(skip).toHaveCSS("background-color", TRANSPARENT);
    });

    async function startCounting(page: Page): Promise<void> {
      await goToTheLinkStep(page);
      await page.getByRole("button", { name: "Add a folder" }).click();
      await page
        .getByRole("alertdialog", { name: "Pick a folder" })
        .getByRole("button", { name: "Continue" })
        .click();
      await expect(page.getByText("Counting… 38 so far")).toBeVisible();
    }

    function folderRow(page: Page, name: string) {
      return page
        .getByRole("region", { name: "Folders" })
        .getByRole("listitem")
        .filter({ hasText: name });
    }

    test("lists each folder as a three-line item: its name, where it is, then how many books", async ({
      page,
    }) => {
      await goToTheLinkStep(page);
      const row = folderRow(page, MANGA.name);

      const name = await boxOf(row.getByText(MANGA.name, { exact: true }));
      const place = await boxOf(row.getByText(MANGA.location));
      const count = await boxOf(row.getByText("214 books"));

      expect(place.y).toBeGreaterThanOrEqual(name.y + name.height);
      expect(count.y).toBeGreaterThanOrEqual(place.y + place.height);
      await expect(row.getByText(MANGA.name, { exact: true })).toHaveCSS(
        "font-size",
        ROW_TITLE_SIZE,
      );
      await expect(row.getByText(MANGA.name, { exact: true })).toHaveCSS(
        "font-weight",
        REGULAR_WEIGHT,
      );
      await expect(row.getByText(MANGA.location)).toHaveCSS(
        "font-size",
        ROW_DETAIL_SIZE,
      );
      await expect(row.getByText("214 books")).toHaveCSS(
        "font-size",
        ROW_DETAIL_SIZE,
      );
    });

    test("draws the folder icon bare, level with the name, with no tile behind it", async ({
      page,
    }) => {
      await goToTheLinkStep(page);
      const row = folderRow(page, MANGA.name);
      const media = row.locator("[data-slot=item-media]");

      const icon = await boxOf(media.locator("svg"));
      const name = await boxOf(row.getByText(MANGA.name, { exact: true }));

      await expect(media).toHaveCSS("background-color", TRANSPARENT);
      expect(icon.y).toBeLessThanOrEqual(name.y + name.height);
    });

    test("rules a line between the rows inside one outlined container", async ({
      page,
    }) => {
      linked = [HOME, COMICS, MANGA];
      await goToTheLinkStep(page);
      const rows = page
        .getByRole("region", { name: "Folders" })
        .getByRole("listitem");

      await expect(rows.nth(0)).toHaveCSS("border-bottom-width", "1px");
      await expect(rows.nth(1)).toHaveCSS("border-bottom-width", "0px");
      await expect(rows.nth(1).locator("xpath=..")).toHaveCSS(
        "border-top-width",
        "1px",
      );
    });

    test("wraps a long place onto more lines inside the page", async ({
      page,
    }) => {
      linked = [HOME, { ...MANGA, location: LONG_PLACE }];
      await goToTheLinkStep(page);

      const place = await boxOf(
        folderRow(page, MANGA.name).getByText(LONG_PLACE),
      );

      expect(place.height).toBeGreaterThan(20);
      expect(await sidewaysOverflow(page)).toEqual([]);
    });

    test("lists the folder being counted first, above the folders already linked", async ({
      page,
    }) => {
      await startCounting(page);
      const rows = page
        .getByRole("region", { name: "Folders" })
        .getByRole("listitem");

      await expect(rows.first()).toContainText(COMICS.name);
      await expect(rows.last()).toContainText(MANGA.name);
    });

    test("shows no finding toast while the folder is counted", async ({
      page,
    }) => {
      await startCounting(page);

      await expect(page.getByText("Finding books")).toHaveCount(0);
    });

    test("counts a folder in its own row with a small indicator, over the folders already linked", async ({
      page,
    }) => {
      await startCounting(page);
      const row = folderRow(page, COMICS.name);
      const indicator = row.locator("[data-slot=spinner]");

      await expect(indicator).toHaveAttribute("width", String(SPINNER_SIZE));
      await expect(row.getByText(COMICS.location)).toBeVisible();
      await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
    });

    test("sets the step's buttons in a medium 16px label that grows with the text size", async ({
      page,
    }) => {
      await setTextScale(page, LARGE_TEXT_SCALE);
      await goToTheLinkStep(page);

      for (const name of ["Add a folder", "Continue", /^Skip/]) {
        const button = page.getByRole("button", { name });
        await expect(button).toHaveCSS(
          "font-size",
          `${String(BUTTON_LABEL_SIZE * LARGE_TEXT_SCALE)}px`,
        );
        await expect(button).toHaveCSS("font-weight", BUTTON_LABEL_WEIGHT);
      }
    });
  },
);
