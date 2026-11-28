import type { Page } from "@playwright/test";

import { CommandFailure } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

let accessibilitySettingsOpened = 0;
let opensSettings = true;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    openAccessibilitySettings: () => {
      if (!opensSettings) {
        throw new CommandFailure({
          code: "systemSettingsUnavailable",
          message: "Android's accessibility settings could not be opened",
        });
      }
      accessibilitySettingsOpened += 1;
      return null;
    },
  },
});

async function openAccessibility(page: Page): Promise<void> {
  await page.goto("/settings/accessibility");
  await expect(
    page.getByRole("heading", { level: 1, name: "Accessibility" }),
  ).toBeVisible();
}

test.describe(
  "the link to Android's accessibility settings",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's settings");
      accessibilitySettingsOpened = 0;
      opensSettings = true;
    });

    test("opens Android's accessibility settings", async ({ page }) => {
      await openAccessibility(page);

      await page
        .getByRole("button", { name: "Open Android accessibility settings" })
        .click();

      await expect.poll(() => accessibilitySettingsOpened).toBe(1);
    });

    test("rings the link when the keyboard reaches it", async ({ page }) => {
      await openAccessibility(page);
      const link = page.getByRole("button", {
        name: "Open Android accessibility settings",
      });

      await page.keyboard.press("Shift");
      await link.focus();

      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-offset", "-2px");
    });

    test("says Android's settings couldn't be opened", async ({ page }) => {
      opensSettings = false;
      await openAccessibility(page);

      await page
        .getByRole("button", { name: "Open Android accessibility settings" })
        .click();

      await expect(
        page.getByText(
          "Couldn’t open Android’s accessibility settings. Try again.",
        ),
      ).toBeVisible();
    });
  },
);
