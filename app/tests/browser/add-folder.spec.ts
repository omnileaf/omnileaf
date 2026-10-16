import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { emitFakeEvent } from "./fake-backend.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const EMPTY_LIBRARY = "Your library is empty";
const HALF = 0.5;
const LIBRARY_CHANGED = "library-changed";
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

const ADDED = "Added 7 books from Sample Library";
const RESULT_LIFETIME_MS = 5_000;

function scanToast(page: Page, opening: string): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: opening });
}

async function dismissFromTheKeyboard(page: Page): Promise<void> {
  await page.keyboard.press("F6");
  await scanToast(page, "Added")
    .getByRole("button", { name: "Dismiss" })
    .focus();
  await page.keyboard.press("Enter");
}

test.describe("with a folder of books", () => {
  test.use({ backend: SAMPLE_LIBRARY_SCANNED });

  for (const { place, path, region } of PLACES) {
    test(`adds a folder from ${place} and reports the books it added`, async ({
      page,
    }) => {
      await page.goto(path);

      await addFolderIn(page, region).click();

      await expect(scanToast(page, "Added")).toContainText(ADDED);
    });
  }

  test("lets the result be dismissed", async ({ page }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const report = scanToast(page, "Added");
    await expect(report).toContainText(ADDED);

    await report.getByRole("button", { name: "Dismiss" }).click();

    await expect(report).toHaveCount(0);
  });

  test("shows the books in the library from Settings › Library", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();

    await scanToast(page, "Added")
      .getByRole("button", { name: "Show" })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  });

  test("closes the result by itself after a few seconds", async ({ page }) => {
    await page.clock.install();
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const report = scanToast(page, "Added");
    await expect(report).toContainText(ADDED);

    await page.clock.runFor(RESULT_LIFETIME_MS);

    await expect(report).toHaveCount(0);
  });

  for (const { place, path, region } of PLACES) {
    test(`returns focus to Add a folder in ${place} once the result is dismissed`, async ({
      page,
    }) => {
      await page.goto(path);
      const addFolder = addFolderIn(page, region);
      await addFolder.focus();
      await page.keyboard.press("Enter");
      await expect(scanToast(page, "Added")).toBeVisible();
      await addFolder.focus();

      await dismissFromTheKeyboard(page);

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

      await expect(scanToast(page, "Added")).toContainText(ADDED);
      expect((await boxOf(button)).width).toBe(before.width);
    });
  }
});

test.describe("once a folder brings the library its first books", () => {
  const added = { hasBooks: false };
  test.use({
    backend: {
      ...SAMPLE_LIBRARY_SCANNED,
      addLibraryFolder: () => {
        added.hasBooks = true;
        return SAMPLE_LIBRARY_SCANNED.addLibraryFolder();
      },
      librarySeries: pagedSeries(() => (added.hasBooks ? sampleSeries(3) : [])),
      librarySeriesCount: () => (added.hasBooks ? 3 : 0),
    },
  });

  test.beforeEach(() => {
    added.hasBooks = false;
  });

  test("moves focus to the library's title once the books arrive, since Add a folder goes with the empty library", async ({
    page,
  }) => {
    await page.goto("/");
    const emptyAddFolder = addFolderIn(page, EMPTY_LIBRARY);
    await emptyAddFolder.focus();
    await page.keyboard.press("Enter");
    await expect(scanToast(page, "Added")).toBeVisible();

    await emitFakeEvent(page, LIBRARY_CHANGED);

    await expect(emptyAddFolder).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeFocused();
  });

  test("returns focus to the library's title once the result is dismissed", async ({
    page,
  }) => {
    await page.goto("/");
    await addFolderIn(page, EMPTY_LIBRARY).click();
    const report = scanToast(page, "Added");
    await expect(report).toBeVisible();
    await emitFakeEvent(page, LIBRARY_CHANGED);
    await expect(page.getByRole("region", { name: EMPTY_LIBRARY })).toHaveCount(
      0,
    );

    await report.getByRole("button", { name: "Dismiss" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeFocused();
  });
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

    await expect(scanToast(page, "Finding books")).toBeVisible();
    const bar = page.getByRole("progressbar", { name: "Finding books" });
    await expect(bar).toHaveAttribute("aria-valuenow", "32");
    await expect(bar).toHaveAccessibleDescription("32 of 100 books");
  });

  test("fills the bar without animating when motion is reduced", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    const fill = page
      .getByRole("progressbar", { name: "Finding books" })
      .locator("div");
    await expect(fill).toHaveCSS("transition-duration", "0s");
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

test.describe("while the scan is still finding books", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: async (onProgress) => {
        await onProgress.send({ stage: "finding", found: 214 });
        return new Promise(() => undefined);
      },
    },
  });

  test("runs a moving band and counts the books found so far", async ({
    page,
  }) => {
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    const bar = page.getByRole("progressbar", { name: "Finding books" });
    await expect(bar).toHaveAccessibleDescription("214 so far");
    await expect(bar).not.toHaveAttribute("aria-valuenow");
    await expect(bar.locator("div")).toHaveCSS(
      "animation-name",
      "progress-band",
    );
  });

  test("holds the band still when motion is reduced", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    const bar = page.getByRole("progressbar", { name: "Finding books" });
    await expect(bar).toHaveAccessibleDescription("214 so far");
    await expect(bar.locator("div")).toHaveCSS("animation-name", "none");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the band has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/library");
      await page.getByRole("button", { name: "Add a folder" }).click();
      await expect(
        page.getByRole("progressbar", { name: "Finding books" }),
      ).toHaveAccessibleDescription("214 so far");

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("from finding books to the result", () => {
  const scan: { finish: () => void } = { finish: () => undefined };
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      addLibraryFolder: async (onProgress) => {
        await onProgress.send({ stage: "finding", found: 214 });
        await new Promise<void>((resolve) => {
          scan.finish = resolve;
        });
        return SAMPLE_LIBRARY_SCANNED.addLibraryFolder();
      },
    },
  });

  test("turns the finding toast into the result in the same place", async ({
    page,
  }) => {
    await page.goto("/settings/library");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const finding = scanToast(page, "Finding books");
    await expect(finding).toContainText("214 so far");
    const place = await boxOf(finding);

    scan.finish();

    const result = scanToast(page, "Added");
    await expect(result).toContainText(ADDED);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    expect(await result.getAttribute("data-index")).toBe("0");
    expect((await boxOf(result)).x).toBe(place.x);
    await expect(
      page
        .getByRole("region", { name: "Notifications F6" })
        .getByRole("listitem"),
    ).toHaveCount(1);
  });

  test("turns its spinner while finding books", async ({ page }) => {
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(
      scanToast(page, "Finding books").locator("svg").first(),
    ).toHaveCSS("animation-name", "spin");
  });

  test("holds its spinner still when motion is reduced", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/settings/library");

    await page.getByRole("button", { name: "Add a folder" }).click();

    await expect(
      scanToast(page, "Finding books").locator("svg").first(),
    ).toHaveCSS("animation-name", "none");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the finished scan has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/settings/library");
      await page.getByRole("button", { name: "Add a folder" }).click();
      await expect(scanToast(page, "Finding books")).toBeVisible();

      scan.finish();

      await expect(scanToast(page, "Added")).toContainText(ADDED);
      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test("opens Settings › Library from Settings", async ({ page }) => {
  await page.goto("/settings");

  await page
    .getByRole("main")
    .getByRole("link", { name: /^Library/ })
    .click();

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
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test(`puts a ${String(buttonHeight)}px Add a folder across the foot of the Folders card`, async ({
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
      expect(button.y).toBeGreaterThan(heading.y + heading.height);
      expect(button.y + button.height).toBeLessThan(region.y + region.height);
      expect(button.width).toBeGreaterThan(region.width * HALF);
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
  { platform: "android", titleSize: "14px" },
] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use({
      backend: {
        ...SAMPLE_LIBRARY_SCANNED,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test(`titles the result at ${titleSize}`, async ({ page }) => {
      test.skip(
        platform === "android" && viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "phones only",
      );
      await page.goto("/settings/library");

      await addFolderIn(page, "Folders").click();

      await expect(
        scanToast(page, "Added").getByText(ADDED, { exact: true }),
      ).toHaveCSS("font-size", titleSize);
    });
  });
}
