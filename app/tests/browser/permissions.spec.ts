import type { Page } from "@playwright/test";

import type { LibraryFolder, Platform } from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const LINKED_FOLDERS = [
  { name: "Comics", location: "/storage/emulated/0/Comics" },
  { name: "Manga", location: "/storage/1234-5678/Manga" },
].map(
  ({ name, location }, index) =>
    ({
      id: String(index + 1),
      kind: "linked",
      name,
      location,
      isAvailable: true,
    }) as LibraryFolder,
);

let settingsOpened = 0;

function backendOn(
  platform: Platform,
  folders: readonly LibraryFolder[] = LINKED_FOLDERS,
): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    libraryFolders: () => ({ folders: [...folders], next: null }),
    openSystemSettings: () => {
      settingsOpened += 1;
      return null;
    },
  };
}

async function openPermissions(page: Page): Promise<void> {
  await page.goto("/settings/privacy/permissions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Permissions" }),
  ).toBeVisible();
}

function rows(page: Page) {
  return page.getByRole("list", { name: "Permissions" }).getByRole("listitem");
}

test.beforeEach(() => {
  settingsOpened = 0;
});

test.describe("on Windows with folders linked", () => {
  test.use({ backend: backendOn("windows") });

  test("Privacy and security says folders are allowed and nothing else asked", async ({
    page,
  }) => {
    await page.goto("/settings/privacy");

    await expect(
      page.getByRole("main").getByRole("link", { name: /^Permissions/ }),
    ).toHaveAccessibleName(
      "Permissions Folders allowed; nothing else asked yet",
    );
  });

  test("lists each permission, what it's for and its state", async ({
    page,
  }) => {
    await openPermissions(page);

    await expect(rows(page)).toHaveText([
      "Folders Picked with the system’s folder picker. Allowed",
      "Notifications For finished downloads. Asked when downloads arrive. Not asked yet",
      "Local network To find your own server. Asked when you add one. Not asked yet",
      "Camera To scan a pairing code. Asked when you pair a device. Not asked yet",
      "Open Windows Settings Change any of these there.",
    ]);
  });

  test("its last row opens Windows Settings", async ({ page }) => {
    await openPermissions(page);

    await page.getByRole("button", { name: /^Open Windows Settings/ }).click();

    await expect.poll(() => settingsOpened).toBe(1);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openPermissions(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("when the settings can't be opened", () => {
  test.use({
    backend: {
      ...backendOn("windows"),
      openSystemSettings: () => {
        throw new CommandFailure({
          code: "systemSettingsUnavailable",
          message: "the system's settings could not be opened",
        });
      },
    },
  });

  test("says the settings didn't open", async ({ page }) => {
    await openPermissions(page);

    await page.getByRole("button", { name: /^Open Windows Settings/ }).click();

    await expect(
      page.getByText("The system’s settings didn’t open"),
    ).toBeVisible();
  });
});

test.describe("on Android", () => {
  test.use({ backend: backendOn("android") });

  test("names the folders picked with Android's picker", async ({ page }) => {
    await openPermissions(page);

    await expect(rows(page).first()).toContainText(
      "Comics and Manga, picked with Android’s folder picker.",
    );
    await expect(rows(page).last()).toContainText("Open Android settings");
  });
});

test.describe("before any folder is linked", () => {
  test.use({ backend: backendOn("windows", []) });

  test("nothing has been asked", async ({ page }) => {
    await openPermissions(page);

    await expect(rows(page).first()).toContainText("Not asked yet");
  });
});

test.describe("on Linux", () => {
  test.use({ backend: backendOn("linux") });

  test("leaves out a settings row, as Linux has no one settings app", async ({
    page,
  }) => {
    await openPermissions(page);

    await expect(rows(page)).toHaveCount(4);
  });
});

test.describe("on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ backend: backendOn("macos") });

  test("its last row opens System Settings", async ({ page }) => {
    await openPermissions(page);

    await page.getByRole("button", { name: /^Open System Settings/ }).click();

    await expect.poll(() => settingsOpened).toBe(1);
  });
});
