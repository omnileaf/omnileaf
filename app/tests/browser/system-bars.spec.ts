import type { Theme } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const reportedThemes: Theme[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    matchSystemBars: (theme) => {
      reportedThemes.push(theme);
    },
  },
});

test.beforeEach(() => {
  reportedThemes.length = 0;
});

function lastReportedTheme(): Theme | undefined {
  return reportedThemes.at(-1);
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
