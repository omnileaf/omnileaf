import type { Locator, Page, TestInfo } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  EXPANDED_MIN_WIDTH,
  onPlatform,
  screenSizeOf,
  test,
  viewportOf,
} from "./fixtures.ts";
import {
  BOOK_ID,
  NEXT_BOOK,
  readerBackend,
  servePages,
} from "./reader-book.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";
import { openViewOptions } from "./view-options.ts";

const REMOVE_FOLDER = "Remove folder";
const NEXT_BOOK_LABEL = `Next chapter: ${NEXT_BOOK.title}`;

const FOLDERS_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryFolders: () => ({
    folders: [
      {
        id: "1",
        kind: "home",
        name: "Omnileaf",
        location: "/data/Omnileaf",
        isAvailable: true,
      },
      {
        id: "2",
        kind: "linked",
        name: "Sample Comics",
        location: "/media/Sample Comics",
        isAvailable: true,
      },
    ],
    next: null,
  }),
};

interface IconAction {
  readonly screen: string;
  readonly backend: FakeBackend;
  readonly reach: (page: Page) => Promise<Locator>;
  readonly label: string;
  readonly isShownOn?: (page: Page) => boolean;
}

const SERIES_COUNT = 3;

const SERIES_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => sampleSeries(SERIES_COUNT)),
  libraryView: () => DEFAULT_LIBRARY_VIEW,
  setLibraryView: () => null,
  librarySeriesCount: () => SERIES_COUNT,
};

const ANDROID_BACKEND = onPlatform("android").backend;

const CRASHED_ON_ANDROID: FakeBackend = {
  ...ANDROID_BACKEND,
  offerSavedCrashReport: () => ({
    details: "Omnileaf 1.2.3 on Android\nPanic: index out of bounds\n",
    origin: "panic",
  }),
};

const FAILS_TO_READ_THE_FOLDER: FakeBackend = {
  ...DEFAULT_BACKEND,
  addLibraryFolder: () => {
    throw new CommandFailure({
      code: "folderUnreadable",
      message: "the folder could not be read",
    });
  },
};

function isPhoneScreen(page: Page): boolean {
  return screenSizeOf(page) === "phone";
}

function isWideScreen(page: Page): boolean {
  return viewportOf(page).width >= EXPANDED_MIN_WIDTH;
}

const SHELF = new FakeShelf([{ state: "read" }, { state: "notStarted" }]);

async function pickFirstBook(page: Page): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await page
    .getByRole("checkbox", { name: `Select ${SHELF.titleOf(0)}` })
    .check();
  return page.getByRole("group", { name: "Selected books" });
}

function seriesBarStep(label: string): IconAction {
  return {
    screen: "the series' selection bar",
    backend: SHELF.backend(),
    reach: async (page) =>
      (await pickFirstBook(page)).getByRole("button", { name: label }),
    label,
    isShownOn: isWideScreen,
  };
}

function coversPerRowStep(label: string): IconAction {
  return {
    screen: "View options",
    backend: SERIES_BACKEND,
    reach: async (page) => {
      await page.goto("/");
      const options = await openViewOptions(page);
      return options.getByRole("button", { name: label });
    },
    label,
  };
}

const ICON_ACTIONS: readonly IconAction[] = [
  {
    screen: "Settings › Library",
    backend: FOLDERS_BACKEND,
    reach: async (page) => {
      await page.goto("/settings/library");
      return page.getByRole("button", { name: "Remove Sample Comics" });
    },
    label: REMOVE_FOLDER,
  },
  {
    screen: "Search",
    backend: DEFAULT_BACKEND,
    reach: async (page) => {
      await page.goto("/search");
      await page
        .getByRole("main")
        .getByRole("combobox", { name: "Search your library" })
        .pressSequentially("unread market");
      return page.getByRole("button", { name: "Remove the Unread filter" });
    },
    label: "Remove the Unread filter",
  },
  {
    screen: "the reader",
    backend: readerBackend(DEFAULT_BACKEND),
    reach: async (page) => {
      await servePages(page);
      await page.goto(`/read/${BOOK_ID}`);
      return page.getByRole("link", { name: NEXT_BOOK_LABEL });
    },
    label: NEXT_BOOK_LABEL,
  },
  seriesBarStep("Mark read"),
  seriesBarStep("Mark unread"),
  seriesBarStep("Clear the selection"),
  {
    screen: "a series' book",
    backend: SHELF.backend(),
    reach: async (page) => {
      await page.goto(`/series/${SERIES_ID}`);
      return page.getByRole("button", { name: `More for ${SHELF.titleOf(1)}` });
    },
    label: "More",
    isShownOn: isWideScreen,
  },
  coversPerRowStep("Fewer covers per row"),
  coversPerRowStep("More covers per row"),
  {
    screen: "Filter and sort",
    backend: SERIES_BACKEND,
    reach: async (page) => {
      await page.goto("/");
      await page
        .locator("main header")
        .getByRole("button", { name: /^Filter and sort/ })
        .click();
      return page
        .getByRole("dialog", { name: "Filter and sort" })
        .getByRole("button", { name: "Close" });
    },
    label: "Close",
    isShownOn: (page) => !isPhoneScreen(page),
  },
  {
    screen: "a notice",
    backend: FAILS_TO_READ_THE_FOLDER,
    reach: async (page) => {
      await page.goto("/");
      await page
        .getByRole("region", { name: "Your library is empty" })
        .getByRole("button", { name: "Add a folder" })
        .click();
      return page
        .getByRole("region", { name: "Notifications F6" })
        .getByRole("button", { name: "Dismiss" });
    },
    label: "Dismiss",
  },
  {
    screen: "the crash report on an Android phone",
    backend: CRASHED_ON_ANDROID,
    reach: async (page) => {
      await page.goto("/");
      return page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Don't send" });
    },
    label: "Don't send",
    isShownOn: isPhoneScreen,
  },
  {
    screen: "an Android settings page",
    backend: ANDROID_BACKEND,
    reach: async (page) => {
      await page.goto("/settings/about/licences");
      await page
        .locator('main a[href^="/settings/about/licences/"]')
        .first()
        .click();
      return page.getByRole("link", { name: "Back to Open-source licences" });
    },
    label: "Back to Open-source licences",
  },
];

function tooltipOf(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true });
}

function removeSampleComics(page: Page): Locator {
  return page.getByRole("button", { name: "Remove Sample Comics" });
}

function isTouchScreen(testInfo: TestInfo): boolean {
  return testInfo.project.use.hasTouch === true;
}

async function holdFingerOn(action: Locator): Promise<void> {
  await action.dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
}

async function liftFingerFrom(action: Locator): Promise<void> {
  await action.dispatchEvent("pointerup", {
    pointerType: "touch",
    isPrimary: true,
  });
  await action.dispatchEvent("click");
}

for (const { screen, backend, reach, label, isShownOn } of ICON_ACTIONS) {
  test.describe(`the icon actions on ${screen}`, () => {
    test.use({ backend });

    test(`names ${label} in a tooltip while the pointer rests on it`, async ({
      page,
    }) => {
      test.skip(isShownOn?.(page) === false, `not shown on this screen`);
      const action = await reach(page);

      await action.hover();

      await expect(tooltipOf(page, label)).toBeVisible();
      await expect(action).toHaveAccessibleDescription(label);
      await expect(action).not.toHaveAttribute("title");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`shows the ${label} tooltip with no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        test.skip(isShownOn?.(page) === false, `not shown on this screen`);
        await page.emulateMedia({ colorScheme });
        const action = await reach(page);
        await action.hover();
        await expect(tooltipOf(page, label)).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }
  });
}

test.describe("an icon action's tooltip", () => {
  test.use({ backend: FOLDERS_BACKEND });

  test("shows when the keyboard reaches the action, leaving focus on it", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    const remove = removeSampleComics(page);
    await expect(remove).toBeVisible();
    await page.getByRole("button", { name: "Rescan Sample Comics" }).focus();

    await page.keyboard.press("Tab");

    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();
    await expect(remove).toBeFocused();
  });

  test("goes away when the keyboard moves on", async ({ page }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Rescan Sample Comics" }).focus();
    await page.keyboard.press("Tab");
    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();

    await page.keyboard.press("Tab");

    await expect(tooltipOf(page, REMOVE_FOLDER)).toHaveCount(0);
  });

  test("shows once a finger is held on the action, without running it", async ({
    page,
  }, testInfo) => {
    test.skip(!isTouchScreen(testInfo), "touch screens only");
    await page.goto("/settings/library");
    const remove = removeSampleComics(page);
    await expect(remove).toBeVisible();

    await holdFingerOn(remove);
    await expect(tooltipOf(page, REMOVE_FOLDER)).toBeVisible();
    await liftFingerFrom(remove);

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("stays hidden on a tap, which runs the action", async ({
    page,
  }, testInfo) => {
    test.skip(!isTouchScreen(testInfo), "touch screens only");
    await page.goto("/settings/library");

    const remove = removeSampleComics(page);

    await remove.tap();

    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(remove).toHaveAccessibleDescription("");
  });
});
