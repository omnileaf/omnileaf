import type { Locator, Page } from "@playwright/test";

import type {
  FolderProblem,
  MissingFolder,
  SignInOutcome,
} from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
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
const TOUCH_TARGET = 44;
const NAS_MANGA = { server: "nas", name: "nas/manga" };

let missing: MissingFolder[] = [];
let asked: string[] = [];
let signIn: SignInOutcome = "cancelled";

function folderWith(problem: FolderProblem, name: string): MissingFolder {
  return {
    folder: {
      id: FOLDER_ID,
      kind: "linked",
      name,
      location: `/media/${name}`,
      isAvailable: false,
    },
    problem,
    hiddenSeries: 41,
    isShownAnyway: false,
  } as MissingFolder;
}

function comicsGone(): MissingFolder {
  return folderWith({ kind: "missing" }, "Comics");
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
    relocateLibraryFolder: (id) => {
      asked.push(`relocate ${id}`);
      missing = [];
      return null;
    },
    removeLibraryFolder: (id) => {
      asked.push(`remove ${id}`);
      missing = [];
      return null;
    },
    signInToLibraryFolder: (id) => {
      asked.push(`sign in ${id}`);
      return signIn;
    },
    rescanLibraryFolder: (id) => {
      asked.push(`rescan ${id}`);
      return { id, name: "Manga", outcome: { kind: "unreachable" } };
    },
    libraryFolderBookCount: () => 41,
  },
});

test.beforeEach(() => {
  missing = [comicsGone()];
  asked = [];
  signIn = "cancelled";
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

  test("reaches the dismiss button from the keyboard with a focus ring and a 44px hit area", async ({
    page,
  }) => {
    await page.goto("/");
    const dismiss = cardIn(page).getByRole("button", { name: "Dismiss" });

    await dismiss.focus();
    const area = await dismiss.evaluate((button) => {
      const { width, height } = getComputedStyle(button, "::before");
      return { width, height };
    });

    await expect(dismiss).toHaveCSS("outline-style", "solid");
    expect(area).toEqual({
      width: `${String(TOUCH_TARGET)}px`,
      height: `${String(TOUCH_TARGET)}px`,
    });
  });

  test("keeps the keyboard on the first action when Show them anyway swaps the actions", async ({
    page,
  }) => {
    await page.goto("/");
    const card = cardIn(page);
    await card.getByRole("button", { name: "Show them anyway" }).focus();

    await page.keyboard.press("Enter");

    await expect(card).toContainText("shown, but can’t be opened");
    await expect(
      card.getByRole("button", { name: "Find the folder" }),
    ).toBeFocused();
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

test.describe("other missing folders on an iPhone", { tag: "@native" }, () => {
  testOnlyInItsWebview("ios");

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("offers Choose it again and Unlink it for a folder Omnileaf can't open", async ({
    page,
  }) => {
    missing = [folderWith({ kind: "lostAccess" }, "Manga")];
    await page.goto("/");
    const card = cardIn(page);

    await expect(card).toContainText("Omnileaf can’t open Manga");
    const choose = await boxOf(
      card.getByRole("button", { name: "Choose it again" }),
    );
    const unlink = await boxOf(card.getByRole("button", { name: "Unlink it" }));
    await card.getByRole("button", { name: "Choose it again" }).click();

    expect(choose.y).toBeLessThan(unlink.y);
    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("offers Sign in, then Sign in again once the sign-in fails", async ({
    page,
  }) => {
    missing = [folderWith({ kind: "needsSignIn", share: NAS_MANGA }, "Manga")];
    signIn = "failed";
    await page.goto("/");
    const card = cardIn(page);

    await card.getByRole("button", { name: "Sign in" }).click();

    await expect(card).toContainText("Couldn’t sign in to Manga");
    await expect(
      card.getByRole("button", { name: "Sign in again" }),
    ).toBeVisible();
    expect(asked).toEqual([`sign in ${FOLDER_ID}`]);
  });

  test("offers Try again for a share the system mounts", async ({ page }) => {
    missing = [
      folderWith({ kind: "needsMounting", share: NAS_MANGA }, "Manga"),
    ];
    await page.goto("/");
    const card = cardIn(page);

    await expect(card).toContainText("Mount Manga’s share again");
    await card.getByRole("button", { name: "Try again" }).click();

    await expect.poll(() => asked).toEqual([`rescan ${FOLDER_ID}`]);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await expect(cardIn(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
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
