import type { ThemePreference } from "../../src/lib/ipc/bindings.ts";

import type { FakeBackend } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

let kept: ThemePreference | null = null;
let shownPreferences: ThemePreference[] = [];
let askedForKeptTheme = 0;

function backendOn(platform: "android" | "linux"): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    rememberedTheme: () => {
      askedForKeptTheme += 1;
      return kept;
    },
    matchSystemBars: (_theme, preference) => {
      shownPreferences.push(preference);
      return null;
    },
  };
}

test.beforeEach(() => {
  kept = null;
  shownPreferences = [];
  askedForKeptTheme = 0;
});

test.describe("on Android", () => {
  test.use({ backend: backendOn("android") });

  testOnlyInItsWebview("android");

  test("takes the theme Android kept when the page lost the choice", async ({
    page,
  }) => {
    kept = "light";
    await page.emulateMedia({ colorScheme: "dark" });

    await page.goto("/");

    await expect.poll(() => shownPreferences.length).toBeGreaterThan(0);
    expect(new Set(shownPreferences)).toEqual(new Set(["light"]));
    expect(
      await page.evaluate(() => localStorage.getItem("omnileaf.theme")),
    ).toBe("light");
  });

  test("keeps the page's own choice while Android has kept none", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("omnileaf.theme", "dark");
    });

    await page.goto("/");

    await expect.poll(() => shownPreferences.length).toBeGreaterThan(0);
    expect(new Set(shownPreferences)).toEqual(new Set(["dark"]));
  });
});

test.describe("away from Android", () => {
  test.use({ backend: backendOn("linux") });

  test("never asks for a kept theme", async ({ page }) => {
    await page.goto("/");

    await expect.poll(() => shownPreferences.length).toBeGreaterThan(0);
    expect(askedForKeptTheme).toBe(0);
  });
});
