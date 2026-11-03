import type { Page } from "@playwright/test";

import type { Platform, WallpaperColours } from "../../src/lib/ipc/bindings.ts";
import { BLUE_WALLPAPER } from "../sample-wallpaper.ts";
import {
  accessibilityViolations,
  expect,
  onPlatform,
  test,
  tokenColour,
} from "./fixtures.ts";

const ROOT = ":root";
const LIGHT_PRIMARY = "--android-wallpaper-light-primary";
const BLUE_PRIMARY = "#416189";
const OMNILEAF_FOOTER = "Covers and pages keep their own colours.";

let wallpaper: WallpaperColours | null = BLUE_WALLPAPER;

test.use({
  backend: {
    ...onPlatform("android").backend,
    wallpaperColours: () => wallpaper,
  },
});

test.beforeEach(() => {
  wallpaper = BLUE_WALLPAPER;
});

async function openAppearance(page: Page): Promise<void> {
  await page.goto("/settings/appearance");
  await expect(
    page.getByRole("heading", { level: 1, name: "Appearance" }),
  ).toBeVisible();
}

function wallpaperPrimary(page: Page): Promise<string> {
  return page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    LIGHT_PRIMARY,
  );
}

test.describe("the Colours choice on Android", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's Colours choice");
  });

  test("offers Omnileaf, chosen, and From your wallpaper, with what each does", async ({
    page,
  }) => {
    await openAppearance(page);

    const colours = page.getByRole("radiogroup", { name: "Colours" });

    await expect(colours.getByRole("radio")).toHaveText([
      /Omnileaf/,
      /From your wallpaper/,
    ]);
    await expect(
      colours.getByRole("radio", { name: "Omnileaf" }),
    ).toBeChecked();
    await expect(
      page.getByText("The app's own theme. The default."),
    ).toBeVisible();
    await expect(
      page.getByText("Colours Android picks from your wallpaper."),
    ).toBeVisible();
    await expect(page.getByText("Android 12 and later.")).toBeVisible();
    await expect(page.getByText(OMNILEAF_FOOTER)).toBeVisible();
    await expect(page.locator(ROOT)).not.toHaveAttribute("data-colours");
  });

  test("takes the wallpaper's colours at once when they are chosen and keeps them after a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAppearance(page);

    await page.getByRole("radio", { name: "From your wallpaper" }).click();

    await expect(page.locator(ROOT)).toHaveAttribute(
      "data-colours",
      "wallpaper",
    );
    await expect.poll(() => wallpaperPrimary(page)).toBe(BLUE_PRIMARY);
    await expect
      .poll(() => tokenColour(page, "--native-color-button-primary"))
      .toBe("rgb(65, 97, 137)");
    await page.reload();
    await expect(
      page.getByRole("radio", { name: "From your wallpaper" }),
    ).toBeChecked();
    await expect(page.locator(ROOT)).toHaveAttribute(
      "data-colours",
      "wallpaper",
    );
  });

  test("goes back to Omnileaf's colours at once when Omnileaf is chosen again", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAppearance(page);
    const omnileafPrimary = await tokenColour(
      page,
      "--native-color-button-primary",
    );
    await page.getByRole("radio", { name: "From your wallpaper" }).click();
    await expect.poll(() => wallpaperPrimary(page)).toBe(BLUE_PRIMARY);

    await page.getByRole("radio", { name: "Omnileaf" }).click();

    await expect(page.locator(ROOT)).not.toHaveAttribute("data-colours");
    expect(await wallpaperPrimary(page)).toBe("");
    await expect
      .poll(() => tokenColour(page, "--native-color-button-primary"))
      .toBe(omnileafPrimary);
  });

  test("draws the wallpaper's swatch from the wallpaper while Omnileaf's colours are on", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAppearance(page);

    const swatch = page.locator('[data-colours-swatch="wallpaper"]');

    await expect(swatch).toHaveCSS("width", "40px");
    await expect(swatch).toHaveCSS("background-image", /rgb\(65, 97, 137\)/);
  });

  test("keeps Omnileaf's own swatch in Omnileaf's colours once the wallpaper's are on", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAppearance(page);
    await page.getByRole("radio", { name: "From your wallpaper" }).click();
    await expect(page.locator(ROOT)).toHaveAttribute(
      "data-colours",
      "wallpaper",
    );

    await expect(page.locator('[data-colours-swatch="omnileaf"]')).toHaveCSS(
      "background-image",
      /rgb\(50, 106, 77\)/,
    );
  });

  test("hides the choice below Android 12, where there are no wallpaper colours", async ({
    page,
  }) => {
    wallpaper = null;

    await openAppearance(page);

    await expect(page.getByRole("radiogroup", { name: "Colours" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Android 12 and later.")).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openAppearance(page);
      await expect(
        page.getByRole("radiogroup", { name: "Colours" }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);

      await page.getByRole("radio", { name: "From your wallpaper" }).click();
      await expect(page.locator(ROOT)).toHaveAttribute(
        "data-colours",
        "wallpaper",
      );

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

const OTHER_PLATFORMS: readonly Platform[] = ["linux", "windows", "macos"];

for (const platform of OTHER_PLATFORMS) {
  test.describe(`the Colours choice on ${platform}`, () => {
    test.skip(
      ({ platform: fixed }) => fixed !== undefined,
      "this project fixes the platform",
    );
    test.use({
      backend: {
        ...onPlatform(platform).backend,
        wallpaperColours: () => BLUE_WALLPAPER,
      },
    });

    test("is not shown", async ({ page }) => {
      await openAppearance(page);

      await expect(
        page.getByRole("radiogroup", { name: "Colours" }),
      ).toHaveCount(0);
      await expect(page.getByText("Android 12 and later.")).toHaveCount(0);
    });
  });
}
