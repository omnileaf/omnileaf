import type { Page } from "@playwright/test";

import type {
  ColourRoles,
  WallpaperColours,
} from "../../src/lib/ipc/bindings.ts";
import { BLUE_WALLPAPER as SAMPLE } from "../sample-wallpaper.ts";
import {
  accessibilityViolations,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const COLOURS_KEY = "omnileaf.colours";
const LIGHT_PRIMARY = "--android-wallpaper-light-primary";

function roles(colour: number): ColourRoles {
  return {
    primary: colour,
    onPrimary: colour,
    secondaryContainer: colour,
    onSecondaryContainer: colour,
    tertiaryContainer: colour,
    onTertiaryContainer: colour,
    surface: colour,
    surfaceContainerLow: colour,
    surfaceContainer: colour,
    surfaceContainerHighest: colour,
    onSurface: colour,
    onSurfaceVariant: colour,
    outline: colour,
    outlineVariant: colour,
    inverseSurface: colour,
    inverseOnSurface: colour,
    inversePrimary: colour,
  };
}

const BLUE: WallpaperColours = {
  light: roles(0x416189),
  dark: roles(0xb1c8ec),
};
const ROSE: WallpaperColours = {
  light: roles(0x8c4a5d),
  dark: roles(0xffb0c4),
};

let wallpaper: WallpaperColours = BLUE;

testOnlyInItsWebview("android");

test.use({
  backend: {
    ...onPlatform("android").backend,
    wallpaperColours: () => wallpaper,
  },
});

test.beforeEach(() => {
  wallpaper = BLUE;
});

async function chooseColours(page: Page, choice: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [COLOURS_KEY, choice] as const,
  );
}

function lightPrimary(page: Page): Promise<string> {
  return page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    LIGHT_PRIMARY,
  );
}

function tabPill(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--native-color-tab-pill)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
}

async function leaveAndComeBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", {
        value: state,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
}

test.describe("colours from the wallpaper", () => {
  test("takes Android's wallpaper colours when they are the chosen colours", async ({
    page,
  }) => {
    await chooseColours(page, "wallpaper");

    await page.goto("/settings");

    await expect(page.locator(":root")).toHaveAttribute(
      "data-colours",
      "wallpaper",
    );
    await expect.poll(() => lightPrimary(page)).toBe("#416189");
  });

  test("keeps Omnileaf's colours until the wallpaper's are chosen", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.locator(":root")).not.toHaveAttribute("data-colours");
  });

  test("follows a new wallpaper when the app comes back to the front", async ({
    page,
  }) => {
    await chooseColours(page, "wallpaper");
    await page.goto("/settings");
    await expect.poll(() => lightPrimary(page)).toBe("#416189");
    wallpaper = ROSE;

    await leaveAndComeBack(page);

    await expect.poll(() => lightPrimary(page)).toBe("#8c4a5d");
  });

  test("draws the tab bar's pill in the wallpaper's colours", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await chooseColours(page, "wallpaper");

    await page.goto("/settings");

    await expect
      .poll(() => tabPill(page))
      .toBe(`rgb(${[0x41, 0x61, 0x89].join(", ")})`);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the wallpaper's colours in the ${colorScheme} theme`, async ({
      page,
    }) => {
      wallpaper = SAMPLE;
      await page.emulateMedia({ colorScheme });
      await chooseColours(page, "wallpaper");
      await page.goto("/settings");
      await expect(page.locator(":root")).toHaveAttribute(
        "data-colours",
        "wallpaper",
      );

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
