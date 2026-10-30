import type { Locator, Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

interface ThemeLook {
  readonly informational: string;
  readonly warning: string;
  readonly warningIcon: string;
  readonly ink: string;
}

const THEMES = {
  light: {
    informational: "rgba(246, 246, 246, 0.5)",
    warning: "rgb(255, 244, 206)",
    warningIcon: "rgb(157, 93, 0)",
    ink: "rgba(0, 0, 0, 0.894)",
  },
  dark: {
    informational: "rgba(255, 255, 255, 0.03)",
    warning: "rgb(67, 53, 25)",
    warningIcon: "rgb(252, 225, 0)",
    ink: "rgb(255, 255, 255)",
  },
} as const satisfies Record<"light" | "dark", ThemeLook>;

const UNREADABLE_TITLE = "Couldn't read that folder";
const CHOOSE_ANOTHER = "Choose another folder";
const SCREENSHOT_MODE_ON = "Screenshot mode is on";
const SCREENSHOT_MODE_SHORTCUT = "Control+Shift+H";
const SPACE_UNDER_THE_BAR = 12;
const CLOSE_SIZE = 38;

function notifications(page: Page): Locator {
  return page.getByRole("main").getByRole("region", { name: "Notifications" });
}

function infoBarSaying(page: Page, text: string): Locator {
  return notifications(page)
    .locator("[data-info-bar]")
    .filter({ hasText: text });
}

function surfaceOf(bar: Locator): Locator {
  return bar.locator(":scope > div");
}

function emptyLibrary(page: Page): Locator {
  return page.getByRole("region", { name: "Your library is empty" });
}

function addAFolder(page: Page): Locator {
  return emptyLibrary(page).getByRole("button", { name: "Add a folder" });
}

async function failToAddAFolder(page: Page): Promise<Locator> {
  await addAFolder(page).focus();
  await page.keyboard.press("Enter");
  const warning = infoBarSaying(page, UNREADABLE_TITLE);
  await expect(warning).toBeVisible();
  return warning;
}

async function turnOnScreenshotMode(page: Page): Promise<Locator> {
  await page.keyboard.press(SCREENSHOT_MODE_SHORTCUT);
  const notice = infoBarSaying(page, SCREENSHOT_MODE_ON);
  await expect(notice).toBeVisible();
  return notice;
}

test.describe("Windows notices", () => {
  testOnlyInItsWebview("windows");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: onPlatform("windows").backend.appInfo,
      addLibraryFolder: () => {
        throw new CommandFailure({
          code: "folderUnreadable",
          message: "the folder could not be read",
        });
      },
    },
  });

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
        await page.goto("/");
        await expect(emptyLibrary(page)).toBeVisible();
      });

      test("shows a warning as an InfoBar inside the page, with no floating toast", async ({
        page,
      }) => {
        const warning = await failToAddAFolder(page);

        await expect(warning).toHaveRole("alert");
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
        await expect(surfaceOf(warning)).toHaveCSS(
          "background-color",
          look.warning,
        );
        await expect(surfaceOf(warning)).toHaveCSS("color", look.ink);
        await expect(warning.locator("svg").first()).toHaveCSS(
          "color",
          look.warningIcon,
        );
      });

      test("shows an informational notice in the plain InfoBar fill", async ({
        page,
      }) => {
        const notice = await turnOnScreenshotMode(page);

        await expect(notice).toHaveRole("status");
        await expect(surfaceOf(notice)).toHaveCSS(
          "background-color",
          look.informational,
        );
      });

      test("pushes the page down instead of covering it", async ({ page }) => {
        const heading = page.getByRole("heading", { level: 1 });
        const before = await boxOf(heading);

        const warning = await failToAddAFolder(page);

        const bar = await boxOf(surfaceOf(warning));
        const after = await boxOf(heading);
        expect(after.y - before.y).toBeCloseTo(
          bar.height + SPACE_UNDER_THE_BAR,
          0,
        );
      });

      test("puts the action at the end of the bar, just before the close button", async ({
        page,
      }) => {
        const warning = await failToAddAFolder(page);

        const action = await boxOf(
          warning.getByRole("button", { name: CHOOSE_ANOTHER }),
        );
        const close = await boxOf(
          warning.getByRole("button", { name: "Dismiss" }),
        );
        expect(action.x + action.width).toBeLessThan(close.x);
        expect([close.width, close.height]).toEqual([CLOSE_SIZE, CLOSE_SIZE]);
      });

      test("puts an InfoBar away from the keyboard without moving focus to it first", async ({
        page,
      }) => {
        const warning = await failToAddAFolder(page);
        await expect(notifications(page).locator(":focus")).toHaveCount(0);
        await addAFolder(page).focus();

        await warning.getByRole("button", { name: "Dismiss" }).focus();
        await page.keyboard.press("Enter");

        await expect(warning).toHaveCount(0);
        await expect(addAFolder(page)).toBeFocused();
      });

      test("has no accessibility violations with a warning and an informational InfoBar", async ({
        page,
      }) => {
        await failToAddAFolder(page);
        await turnOnScreenshotMode(page);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }
});
