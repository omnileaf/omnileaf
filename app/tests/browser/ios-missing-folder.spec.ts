import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";
const CARD_INSET = 16;
const DISMISS_INSET = 6;
const DISMISS_SIZE = 34;
const ROW_HEIGHT = 52;
const ROW_TEXT_START = 50;

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
    ...onPlatform("ios").backend,
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

function cardIn(page: Page): Locator {
  return page.locator("[data-slot=missing-folder-card]");
}

test.describe("a missing folder on an iPhone", { tag: "@native" }, () => {
  testOnlyInItsWebview("ios");

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("sits above the covers as a card inset 16px with a 26px corner", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

    const box = await boxOf(card);
    const covers = await boxOf(page.getByRole("list", { name: "Series" }));

    await expect(card).toContainText(
      "41 series are hidden until it’s back. Your reading progress is safe.",
    );
    expect(box.x).toBe(CARD_INSET);
    expect(box.x + box.width).toBe(viewportOf(page).width - CARD_INSET);
    expect(box.y + box.height).toBeLessThanOrEqual(covers.y);
    await expect(card).toHaveCSS("border-top-left-radius", "26px");
    await expect(card).toHaveCSS("margin-top", "4px");
    await expect(card).toHaveCSS("margin-bottom", "8px");
    await expect(card).toHaveCSS(
      "background-color",
      await tokenColour(page, "--warning-soft"),
    );
  });

  test("sets the title in 17px semibold and the words in 15px", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

    const title = card.getByText("Comics isn’t there");
    const words = card.getByText("41 series are hidden");

    await expect(title).toHaveCSS("font-size", "17px");
    await expect(title).toHaveCSS("font-weight", "600");
    await expect(words).toHaveCSS("font-size", "15px");
    await expect(words).toHaveCSS("font-weight", "400");
    await expect(words).toHaveCSS("padding-right", "24px");
  });

  test("stacks Show them anyway and Find the folder as full-width 52px rows", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

    const show = card.getByRole("button", { name: "Show them anyway" });
    const find = card.getByRole("button", { name: "Find the folder" });
    const cardBox = await boxOf(card);
    const showBox = await boxOf(show);
    const findBox = await boxOf(find);

    for (const row of [showBox, findBox]) {
      expect(row.x).toBe(cardBox.x);
      expect(row.width).toBe(cardBox.width);
      expect(row.height).toBe(ROW_HEIGHT);
    }
    expect(findBox.y).toBeCloseTo(showBox.y + ROW_HEIGHT, 0);
    expect(showBox.y + ROW_HEIGHT * 2).toBeCloseTo(
      cardBox.y + cardBox.height,
      0,
    );
    await expect(show).toHaveCSS("padding-left", `${String(ROW_TEXT_START)}px`);
    await expect(show).toHaveCSS("font-size", "17px");
    await expect(show).toHaveCSS("font-weight", "400");
    await expect(show).toHaveCSS(
      "color",
      await tokenColour(page, "--color-accent"),
    );
  });

  test("puts a 34px dismiss button 6px from the top and end corner", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

    const cardBox = await boxOf(card);
    const dismiss = await boxOf(card.getByRole("button", { name: "Dismiss" }));

    expect(dismiss.width).toBe(DISMISS_SIZE);
    expect(dismiss.height).toBe(DISMISS_SIZE);
    expect(dismiss.y - cardBox.y).toBe(DISMISS_INSET);
    expect(cardBox.x + cardBox.width - (dismiss.x + dismiss.width)).toBe(
      DISMISS_INSET,
    );
    await expect(card.locator("button svg").last()).toHaveAttribute(
      "width",
      "17",
    );
  });

  test("stays gone for the rest of the visit once dismissed", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

    await card.getByRole("button", { name: "Dismiss" }).click();

    await expect(card).toHaveCount(0);
  });

  test("says the series are shown but can't be opened once shown anyway, with Find the folder first and Hide them again after", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);

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
    expect(find.y).toBeLessThan(hide.y);
    await card.getByRole("button", { name: "Hide them again" }).click();
    await expect(card).toContainText("41 series are hidden until it’s back.");
    expect(asked).toEqual([
      `show ${FOLDER_ID} true`,
      `show ${FOLDER_ID} false`,
    ]);
  });
});

test.describe("a missing folder on an iPad", () => {
  testOnlyInItsWebview("ios");

  test("keeps the notice as a toast instead of a card in the library", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "tablets only");
    await page.goto("/");

    await expect(page.getByText("Comics isn’t there")).toBeVisible();
    await expect(cardIn(page)).toHaveCount(0);
  });
});
