import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

async function openScreenshotMode(page: Page): Promise<void> {
  await page.goto("/settings/privacy/screenshot-mode");
  await expect(
    page.getByRole("heading", { level: 1, name: "Screenshot mode" }),
  ).toBeVisible();
}

async function startChanging(page: Page): Promise<void> {
  await openScreenshotMode(page);
  await page
    .getByRole("button", { name: "Change the keyboard shortcut" })
    .click();
  await expect(newShortcut(page)).toBeFocused();
}

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Screenshot mode shortcut" });
}

function newShortcut(page: Page) {
  return dialog(page).getByRole("textbox", { name: "New shortcut" });
}

function save(page: Page) {
  return dialog(page).getByRole("button", { name: "Save" });
}

function shownKeys(page: Page) {
  return page
    .getByRole("region", { name: "Turn it on quickly" })
    .locator("kbd");
}

test.use(onPlatform("linux"));

test("records new keys, keeps them and they turn Screenshot mode on", async ({
  page,
}) => {
  await startChanging(page);

  await page.keyboard.press("Control+J");
  await expect(newShortcut(page)).toHaveText("CtrlJ");
  await save(page).click();
  await page.reload();
  await expect(shownKeys(page)).toHaveText(["Ctrl", "J"]);
  await page.keyboard.press("Control+J");

  await expect(dialog(page)).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Screenshot mode", exact: true }),
  ).toBeChecked();
});

test("refuses keys the app already uses and says what they do", async ({
  page,
}) => {
  await startChanging(page);

  await page.keyboard.press("Control+F");

  await expect(newShortcut(page)).toHaveAccessibleDescription(
    "Ctrl F already searches the library. Try another.",
  );
  await expect(newShortcut(page)).toHaveAttribute("aria-invalid", "true");
  await expect(save(page)).toBeDisabled();
});

test("a refused shortcut leaves the field looking as it did", async ({
  page,
}) => {
  await startChanging(page);
  const borderColor = () =>
    newShortcut(page).evaluate((field) => getComputedStyle(field).borderColor);
  const before = await borderColor();

  await page.keyboard.press("Control+F");
  await expect(dialog(page).getByRole("alert")).toBeVisible();

  expect(await borderColor()).toBe(before);
});

test("asks for Ctrl with a letter when a letter is pressed alone", async ({
  page,
}) => {
  await startChanging(page);

  await page.keyboard.press("J");

  await expect(dialog(page).getByRole("alert")).toHaveText(
    "Hold Ctrl and press a letter, with Shift if you like.",
  );
  await expect(save(page)).toBeDisabled();
});

test("pressing the current shortcut while recording leaves Screenshot mode alone", async ({
  page,
}) => {
  await startChanging(page);

  await page.keyboard.press("Control+Shift+H");
  await page.keyboard.press("Escape");

  await expect(dialog(page)).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Screenshot mode", exact: true }),
  ).not.toBeChecked();
});

test("Use the default brings Ctrl Shift H back", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "omnileaf.screenshotModeShortcut",
      JSON.stringify({ letter: "J", shift: false }),
    );
  });
  await startChanging(page);

  await dialog(page).getByRole("button", { name: "Use the default" }).click();
  await save(page).click();

  await expect(shownKeys(page)).toHaveText(["Ctrl", "Shift", "H"]);
});

test("Cancel keeps the shortcut as it was", async ({ page }) => {
  await startChanging(page);

  await page.keyboard.press("Control+J");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await expect(shownKeys(page)).toHaveText(["Ctrl", "Shift", "H"]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a refused shortcut has no accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await startChanging(page);
    await page.keyboard.press("Control+F");
    await expect(dialog(page).getByRole("alert")).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test.describe("on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use(onPlatform("macos"));

  test("refuses ⌘ Q, which quits apps", async ({ page }) => {
    await startChanging(page);

    await page.keyboard.press("Meta+Q");

    await expect(dialog(page).getByRole("alert")).toHaveText(
      "macOS already uses ⌘ Q. Try another.",
    );
  });
});
