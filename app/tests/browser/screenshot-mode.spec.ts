import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
} from "./fixtures.ts";

const SHORTCUT = "Control+Shift+H";
const MAC_SHORTCUT = "Meta+Shift+H";
const TURNED_ON_AT = new Date("2026-10-03T21:14:00Z");
const AN_HOUR_LATER = new Date("2026-10-03T22:14:00Z");
const REAL_FOLDER_NAME = "Generated Sample Shelf";
const COLLECTION_SCREENS = ["/", "/browse", "/history"];
const EMPTY_LIBRARY = "Your library is empty";
const FOLDER_PLACES = [
  { path: "/", region: EMPTY_LIBRARY },
  { path: "/settings/library", region: "Folders" },
] as const;

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function turnOnScreenshotMode(page: Page): Promise<void> {
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();
}

async function addFolder(page: Page, region: string): Promise<void> {
  await page
    .getByRole("region", { name: region })
    .getByRole("button", { name: "Add a folder" })
    .click();
  await expect(page.getByText(/^Found 4 books in /)).toBeVisible();
}

function screenshotModeLabel(page: Page) {
  return page.getByRole("main").getByText("Screenshot mode", { exact: true });
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    addLibraryFolder: () => ({
      name: REAL_FOLDER_NAME,
      series: 1,
      books: 4,
      unreadableBooks: 0,
      unsupportedBooks: 0,
      unreadableFolders: 0,
    }),
  },
});

test("Ctrl Shift H turns Screenshot mode on and off from any screen", async ({
  page,
}) => {
  await open(page, "/history");

  await turnOnScreenshotMode(page);
  await open(page, "/browse");
  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("Screenshot mode is off")).toBeAttached();
});

test("Command Shift H does nothing off a Mac", async ({ page }) => {
  await open(page, "/");

  await page.keyboard.press(MAC_SHORTCUT);
  await open(page, "/");

  await expect(screenshotModeLabel(page)).toHaveCount(0);
});

for (const platform of ["macos", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test("Command Shift H turns Screenshot mode on and off", async ({
      page,
    }) => {
      await open(page, "/");

      await page.keyboard.press(MAC_SHORTCUT);
      await expect(page.getByText("Screenshot mode is on")).toBeAttached();
      await page.keyboard.press(MAC_SHORTCUT);

      await expect(page.getByText("Screenshot mode is off")).toBeAttached();
    });

    test("Ctrl Shift H does nothing", async ({ page }) => {
      await open(page, "/");

      await page.keyboard.press(SHORTCUT);
      await open(page, "/");

      await expect(screenshotModeLabel(page)).toHaveCount(0);
    });
  });
}

test("says so when the hour runs out and again when the shortcut turns it back on", async ({
  page,
}) => {
  await page.clock.install();
  await open(page, "/");
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();

  await page.clock.runFor("01:00:00");
  await expect(page.getByText("Screenshot mode is off")).toBeAttached();
  await page.keyboard.press(SHORTCUT);

  await expect(page.getByText("Screenshot mode is on")).toBeAttached();
});

test("turns off on coming back to the app after the hour ran out while asleep", async ({
  page,
}) => {
  await page.clock.install({ time: TURNED_ON_AT });
  await open(page, "/");
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByText("Screenshot mode is on")).toBeAttached();

  await page.clock.setSystemTime(AN_HOUR_LATER);
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByText("Screenshot mode is off")).toBeAttached();
});

for (const { path, region } of FOLDER_PLACES) {
  test(`no real folder name shows on ${path} while it's on`, async ({
    page,
  }) => {
    await open(page, path);
    await turnOnScreenshotMode(page);

    await addFolder(page, region);

    await expect(
      page.getByText("Found 4 books in 1 series in Folder 01."),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(REAL_FOLDER_NAME);
  });
}

test("a folder name already on screen is replaced when it's turned on", async ({
  page,
}) => {
  await open(page, "/");
  await addFolder(page, EMPTY_LIBRARY);

  await turnOnScreenshotMode(page);

  await expect(
    page.getByText("Found 4 books in 1 series in Folder 01."),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(REAL_FOLDER_NAME);
});

for (const path of COLLECTION_SCREENS) {
  test(`${path} is labelled while it's on`, async ({ page }) => {
    await open(page, path);
    await expect(screenshotModeLabel(page)).toHaveCount(0);

    await turnOnScreenshotMode(page);

    await expect(screenshotModeLabel(page)).toBeVisible();
  });
}

test("the label stays hidden once it's turned off in settings", async ({
  page,
}) => {
  await open(page, "/settings/privacy/screenshot-mode");
  await page
    .getByRole("switch", { name: "Show the Screenshot mode label" })
    .click();
  await turnOnScreenshotMode(page);

  await open(page, "/");

  await expect(screenshotModeLabel(page)).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the labelled library has no accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, "/");
    await turnOnScreenshotMode(page);
    await addFolder(page, EMPTY_LIBRARY);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
