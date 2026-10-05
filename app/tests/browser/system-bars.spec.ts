import type { Theme, ThemePreference } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const reportedThemes: Theme[] = [];
const reportedPreferences: ThemePreference[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    matchSystemBars: (theme, preference) => {
      reportedThemes.push(theme);
      reportedPreferences.push(preference);
      return null;
    },
  },
});

test.beforeEach(() => {
  reportedThemes.length = 0;
  reportedPreferences.length = 0;
});

function lastReportedTheme(): Theme | undefined {
  return reportedThemes.at(-1);
}

function lastReportedPreference(): ThemePreference | undefined {
  return reportedPreferences.at(-1);
}

test("reports the device's theme when the app opens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });

  await page.goto("/");

  await expect.poll(lastReportedTheme).toBe("dark");
});

test("reports the device's new theme when it changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect.poll(lastReportedTheme).toBe("light");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect.poll(lastReportedTheme).toBe("dark");
});

test("reports the theme chosen in Settings › Appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings/appearance");
  await expect.poll(lastReportedTheme).toBe("dark");

  await page.locator("label").filter({ hasText: "Light" }).click();

  await expect.poll(lastReportedTheme).toBe("light");
});

test("reports that the theme follows the device until one is chosen", async ({
  page,
}) => {
  await page.goto("/settings/appearance");
  await expect.poll(lastReportedPreference).toBe("system");

  await page.locator("label").filter({ hasText: "Dark" }).click();

  await expect.poll(lastReportedPreference).toBe("dark");
});
