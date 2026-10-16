import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  EXPANDED_MIN_WIDTH,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";

const SHORTCUTS = [
  "Quick open",
  "Search the library",
  "Undo",
  "Screenshot mode",
  "Settings",
  "Keyboard shortcuts",
  "Back",
  "Close a dialog or panel",
  "Move between covers",
  "Open the series",
  "Select",
  "Select all",
  "Move a tab",
];

function sheet(page: Page) {
  return page.getByRole("dialog", { name: "Keyboard shortcuts" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("on a desktop", () => {
  test.use(onPlatform("linux"));

  test("lists the app's own shortcuts when ? is pressed", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Shift+Slash");

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAccessibleDescription(
      "The reader has its own; press ? there to see them.",
    );
    await expect(sheet(page).getByRole("term")).toHaveText(SHORTCUTS);
  });

  test("names the keys with Ctrl", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Shift+Slash");

    await expect(sheet(page).getByRole("definition")).toHaveText([
      "Ctrl K",
      "Ctrl F",
      "Ctrl Z",
      "Ctrl Shift H",
      "Ctrl ,",
      "?",
      "Alt ←",
      "Esc",
      "←→↑↓",
      "Enter",
      "Space",
      "Ctrl A",
      "Alt ↑Alt ↓",
    ]);
  });

  test("lists the Screenshot mode shortcut chosen in settings", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "omnileaf.screenshotModeShortcut",
        JSON.stringify({ letter: "J", shift: false }),
      );
    });
    await openLibrary(page);

    await page.keyboard.press("Shift+Slash");

    await expect(
      sheet(page).getByRole("definition").filter({ hasText: "Ctrl J" }),
    ).toHaveCount(1);
  });

  test("closes with Esc", async ({ page }) => {
    await openLibrary(page);
    await page.keyboard.press("Shift+Slash");
    await expect(sheet(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(sheet(page)).toHaveCount(0);
  });

  test("leaves ? to a field being typed in", async ({ page }) => {
    await openLibrary(page);
    await page.keyboard.press("Control+k");
    const quickOpen = page.getByRole("dialog", { name: "Quick open" });
    await expect(quickOpen).toBeVisible();

    await page.keyboard.press("Shift+Slash");

    await expect(quickOpen.locator("input")).toHaveValue("?");
    await expect(sheet(page)).toHaveCount(0);
  });

  test("goes back up from a page under General with Alt ←", async ({
    page,
  }) => {
    await page.goto("/settings/general/language");
    await expect(
      page.getByRole("heading", { level: 1, name: "Language" }),
    ).toBeVisible();

    await page.keyboard.press("Alt+ArrowLeft");

    await expect(page).toHaveURL("/settings/general");
  });

  test("stays put with Alt ← where there's nowhere back to go", async ({
    page,
  }) => {
    await openLibrary(page);

    await page.keyboard.press("Alt+ArrowLeft");

    await expect(page).toHaveURL("/");
  });

  test("opens Settings with Ctrl ,", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Control+Comma");

    await expect(page).toHaveURL(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH
        ? "/settings/general"
        : "/settings",
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLibrary(page);
      await page.keyboard.press("Shift+Slash");
      await expect(sheet(page)).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

test.describe("on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use(onPlatform("macos"));

  test("goes back up with ⌘ [", async ({ page }) => {
    await page.goto("/settings/general/language");
    await expect(
      page.getByRole("heading", { level: 1, name: "Language" }),
    ).toBeVisible();

    await page.keyboard.press("Meta+BracketLeft");

    await expect(page).toHaveURL("/settings/general");
  });

  test("names the keys with ⌘", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Shift+Slash");

    await expect(sheet(page).getByRole("definition").first()).toHaveText("⌘ K");
  });
});

test.describe("on a touch screen", () => {
  test.use(onPlatform("android"));

  test("has no shortcuts sheet", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Shift+Slash");

    await expect(sheet(page)).toHaveCount(0);
  });
});
