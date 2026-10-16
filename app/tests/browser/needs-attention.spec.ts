import type { Locator, Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";
const COMICS = {
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

let missing: MissingFolder[] = [];
let asked: string[] = [];

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  missingLibraryFolders: () => missing,
  libraryHiddenSeriesCount: () => (missing.length > 0 ? 41 : 0),
  relocateLibraryFolder: (id) => {
    asked.push(`relocate ${id}`);
    missing = [];
    return null;
  },
};

function sidebarItem(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: /^Needs attention/ });
}

function popover(page: Page): Locator {
  return page.getByRole("dialog", { name: "Needs attention" });
}

async function openLibraryOnADesktop(page: Page): Promise<void> {
  await page.goto("/");
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH ||
      test.info().project.use.isMobile === true,
    "the desktop's sidebar",
  );
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

test.use({ backend: BACKEND });

test.beforeEach(() => {
  missing = [COMICS];
  asked = [];
});

test.describe("on a desktop", () => {
  test("counts what needs attention in the sidebar, just above Settings", async ({
    page,
  }) => {
    await openLibraryOnADesktop(page);

    await expect(sidebarItem(page)).toHaveAccessibleName(
      "Needs attention: 1 thing",
    );
    await expect(
      sidebarItem(page).getByText("1", { exact: true }),
    ).toBeVisible();
    const item = await sidebarItem(page).boundingBox();
    const settings = await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .boundingBox();
    expect(settings?.y).toBeGreaterThan(item?.y ?? Number.POSITIVE_INFINITY);
  });

  test("lists each problem with the button that fixes it in a popover", async ({
    page,
  }) => {
    await openLibraryOnADesktop(page);

    await sidebarItem(page).click();

    const row = popover(page).getByRole("listitem");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Comics isn’t there");
    await expect(row).toContainText("41 series hidden until it’s back");
    await expect(
      row.getByRole("button", { name: "Find it" }),
    ).toHaveAccessibleDescription("Comics isn’t there");
  });

  test("fixes a problem from its row, and the count goes once nothing needs attention", async ({
    page,
  }) => {
    await openLibraryOnADesktop(page);
    await sidebarItem(page).click();

    await popover(page).getByRole("button", { name: "Find it" }).click();

    await expect(sidebarItem(page)).toHaveCount(0);
    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("keeps a dismissed problem in the list until it's fixed", async ({
    page,
  }) => {
    await openLibraryOnADesktop(page);
    await page
      .getByRole("listitem")
      .filter({ hasText: "Comics isn’t there" })
      .getByRole("button", { name: "Dismiss" })
      .click();

    await sidebarItem(page).click();

    await expect(popover(page)).toContainText("Comics isn’t there");
  });

  test("shows no item when nothing needs attention", async ({ page }) => {
    missing = [];
    await openLibraryOnADesktop(page);

    await expect(sidebarItem(page)).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations with the popover open in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openLibraryOnADesktop(page);
      await sidebarItem(page).click();
      await expect(popover(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

function dot(page: Page): Locator {
  return page.getByRole("button", { name: /^Needs attention/ });
}

function sheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Needs attention" });
}

async function openLibraryOnAPhone(page: Page): Promise<void> {
  test.skip(
    test.info().project.use.isMobile !== true,
    "the phone's dot on the library's title",
  );
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

test.describe("on a phone", () => {
  test.use({
    backend: { ...BACKEND, appInfo: () => fakeAppInfo("android") },
  });

  test("puts a dot on the library's title that says how many things need attention", async ({
    page,
  }) => {
    await openLibraryOnAPhone(page);

    await expect(dot(page)).toHaveAccessibleName("Needs attention: 1 thing");
    const title = await page
      .getByRole("heading", { name: "Library" })
      .boundingBox();
    const button = await dot(page).boundingBox();
    expect(button?.x).toBeGreaterThan(title?.x ?? Number.POSITIVE_INFINITY);
  });

  test("opens a sheet listing each problem with the button that fixes it", async ({
    page,
  }) => {
    await openLibraryOnAPhone(page);

    await dot(page).click();

    const row = sheet(page).getByRole("listitem");
    await expect(row).toContainText("Comics isn’t there");
    await expect(row).toContainText("41 series hidden until it’s back");
    await expect(row.getByRole("button", { name: "Find it" })).toBeVisible();
  });

  test("fixes a problem from the sheet, and the dot goes once nothing needs attention", async ({
    page,
  }) => {
    await openLibraryOnAPhone(page);
    await dot(page).click();

    await sheet(page).getByRole("button", { name: "Find it" }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(dot(page)).toHaveCount(0);
    expect(asked).toEqual([`relocate ${FOLDER_ID}`]);
  });

  test("closes the sheet with Escape and goes back to the dot", async ({
    page,
  }) => {
    await openLibraryOnAPhone(page);
    await dot(page).click();
    await expect(sheet(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(sheet(page)).toHaveCount(0);
    await expect(dot(page)).toBeFocused();
  });

  test("shows no dot when nothing needs attention", async ({ page }) => {
    missing = [];
    await openLibraryOnAPhone(page);

    await expect(dot(page)).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no accessibility violations with the sheet open in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openLibraryOnAPhone(page);
      await dot(page).click();
      await expect(sheet(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
