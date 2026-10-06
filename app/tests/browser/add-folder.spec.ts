import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const EMPTY_LIBRARY = "Your library is empty";
const SAMPLE_LIBRARY_SCANNED = {
  ...DEFAULT_BACKEND,
  addLibraryFolder: () => ({
    name: "Sample Library",
    series: 3,
    books: 7,
    unreadableBooks: 0,
    unsupportedBooks: 0,
    unreadableFolders: 0,
  }),
};

const PLACES = [
  { place: "the empty library", path: "/", region: EMPTY_LIBRARY },
  { place: "Settings › Library", path: "/settings/library", region: "Folders" },
] as const;

function addFolderIn(page: Page, region: string) {
  return page
    .getByRole("region", { name: region })
    .getByRole("button", { name: "Add a folder" });
}

/** The report of adding a folder, apart from the rescan reports Settings › Library also shows. */
function scanReport(page: Page, opening: string): Locator {
  return page
    .getByRole("main")
    .getByRole("status")
    .filter({ hasText: opening });
}

test.describe("with a folder of books", () => {
  test.use({ backend: SAMPLE_LIBRARY_SCANNED });

  for (const { place, path, region } of PLACES) {
    test(`adds a folder from ${place} and reports the books scanned in it`, async ({
      page,
    }) => {
      await page.goto(path);

      await addFolderIn(page, region).click();

      await expect(scanReport(page, "Found")).toHaveText(
        "Found 7 books in 3 series in Sample Library.",
      );
    });
  }

  test("lets the notice under the folders be dismissed", async ({ page }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const report = scanReport(page, "Found");
    await expect(report).toHaveText(
      "Found 7 books in 3 series in Sample Library.",
    );

    await report.getByRole("button", { name: "Dismiss" }).click();

    await expect(report).toHaveCount(0);
  });

  for (const { place, path, region } of PLACES) {
    test(`returns focus to Add a folder in ${place} once the notice is dismissed`, async ({
      page,
    }) => {
      await page.goto(path);
      const addFolder = addFolderIn(page, region);
      await addFolder.click();
      const report = scanReport(page, "Found");
      await expect(report).toBeVisible();

      await report.getByRole("button", { name: "Dismiss" }).click();

      await expect(addFolder).toBeFocused();
    });
  }

  for (const { place, path, region } of PLACES) {
    test(`keeps the Add a folder button its size in ${place} when the outcome shows`, async ({
      page,
    }) => {
      await page.goto(path);
      const button = addFolderIn(page, region);
      const before = await boxOf(button);

      await button.click();

      await expect(scanReport(page, "Found")).toHaveText(
        "Found 7 books in 3 series in Sample Library.",
      );
      expect((await boxOf(button)).width).toBe(before.width);
    });
  }
});

test.describe("while the folder is being scanned", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: async (onProgress) => {
        await onProgress.send({ stage: "reading", scanned: 32, total: 100 });
        return new Promise(() => undefined);
      },
    },
  });

  test("shows how far the scan has got", async ({ page }) => {
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(scanReport(page, "Finding books")).toHaveText("Finding books");
    const bar = page.getByRole("progressbar", { name: "Finding books" });
    await expect(bar).toHaveAttribute("value", "32");
    await expect(bar).toHaveAccessibleDescription("32 of 100 books");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the scan's progress has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/library");
      await page.getByRole("button", { name: "Add a folder" }).click();
      await expect(page.getByRole("progressbar")).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test("opens Settings › Library from Settings", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("main").getByRole("link", { name: "Library" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { level: 2, name: "Folders" }),
  ).toBeVisible();
});

for (const { platform, buttonHeight } of [
  { platform: "linux", buttonHeight: 36 },
  { platform: "android", buttonHeight: 48 },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test(`puts a ${String(buttonHeight)}px Add a folder at the end of the Folders heading`, async ({
      page,
    }) => {
      await page.goto("/settings/library");
      const folders = page.getByRole("region", { name: "Folders" });

      const region = await boxOf(folders);
      const heading = await boxOf(
        folders.getByRole("heading", { level: 2, name: "Folders" }),
      );
      const button = await boxOf(
        folders.getByRole("button", { name: "Add a folder" }),
      );

      expect(button.height).toBe(buttonHeight);
      expect(button.x + button.width).toBe(region.x + region.width);
      expect(button.y).toBeLessThan(heading.y + heading.height);
      expect(button.y + button.height).toBeGreaterThan(heading.y);
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`Settings › Library has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/settings/library");
    await expect(
      page.getByRole("heading", { level: 2, name: "Folders" }),
    ).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

for (const { platform, titleSize } of [
  { platform: "linux", titleSize: "14px" },
  { platform: "android", titleSize: "15px" },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...SAMPLE_LIBRARY_SCANNED,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test(`titles the report under the folders at ${titleSize}`, async ({
      page,
    }) => {
      test.skip(
        platform === "android" && viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "phones only",
      );
      await page.goto("/settings/library");

      await addFolderIn(page, "Folders").click();

      await expect(
        scanReport(page, "Found").getByText(
          "Found 7 books in 3 series in Sample Library.",
        ),
      ).toHaveCSS("font-size", titleSize);
    });
  });
}
