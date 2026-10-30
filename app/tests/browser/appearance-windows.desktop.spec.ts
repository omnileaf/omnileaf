import type { Page } from "@playwright/test";

import type { AccentColours } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const COLOURS_KEY = "omnileaf.colours";
const BLUE: AccentColours = { light: 0x0067c0, dark: 0x4cc2ff };
const PURPLE: AccentColours = { light: 0x744da9, dark: 0xc3a6f0 };
const OMNILEAF_GREEN = "rgb(47, 111, 79)";
const BLUE_LIGHT = "rgb(0, 103, 192)";
const BLUE_DARK = "rgb(76, 194, 255)";
const PURPLE_LIGHT = "rgb(116, 77, 169)";

let accent: AccentColours | null = BLUE;
let colourSettingsOpened = 0;

testOnlyInItsWebview("windows");

test.use({
  backend: {
    ...onPlatform("windows").backend,
    accentColours: () => accent,
    openColourSettings: () => {
      colourSettingsOpened += 1;
      return null;
    },
  },
});

test.beforeEach(() => {
  accent = BLUE;
  colourSettingsOpened = 0;
});

async function chooseColours(page: Page, choice: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [COLOURS_KEY, choice] as const,
  );
}

function primary(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
}

async function openAppearance(page: Page): Promise<void> {
  await page.goto("/settings/appearance");
  await expect(
    page.getByRole("heading", { level: 1, name: "Appearance" }),
  ).toBeVisible();
}

test.describe("the accent colour on Windows", () => {
  test("offers Omnileaf green and the Windows accent colour, Omnileaf green first", async ({
    page,
  }) => {
    await openAppearance(page);

    const accentChoice = page.getByRole("combobox", { name: "Accent colour" });

    await expect(accentChoice.getByRole("option")).toHaveText([
      "Omnileaf green",
      "Windows accent colour",
    ]);
    await expect(accentChoice).toHaveValue("omnileaf");
    await expect(page.locator(":root")).not.toHaveAttribute("data-colours");
    expect(await primary(page)).toBe(OMNILEAF_GREEN);
  });

  test("takes the Windows accent at once when it is chosen", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openAppearance(page);

    await page
      .getByRole("combobox", { name: "Accent colour" })
      .selectOption({ label: "Windows accent colour" });

    await expect.poll(() => primary(page)).toBe(BLUE_LIGHT);
    await expect(
      page.getByText("Follows the accent colour you picked in Windows."),
    ).toBeVisible();
  });

  test("uses the lighter shade of the accent in dark mode", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await chooseColours(page, "wallpaper");

    await openAppearance(page);

    await expect.poll(() => primary(page)).toBe(BLUE_DARK);
  });

  test("opens Windows colour settings from the card", async ({ page }) => {
    await chooseColours(page, "wallpaper");
    await openAppearance(page);

    await page.getByRole("button", { name: "Windows colour settings" }).click();

    await expect.poll(() => colourSettingsOpened).toBe(1);
  });

  test("follows a new accent when the window is back in focus", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await chooseColours(page, "wallpaper");
    await openAppearance(page);
    await expect.poll(() => primary(page)).toBe(BLUE_LIGHT);
    accent = PURPLE;

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect.poll(() => primary(page)).toBe(PURPLE_LIGHT);
  });

  test("keeps Omnileaf green when Windows has no accent to give", async ({
    page,
  }) => {
    accent = null;
    await chooseColours(page, "wallpaper");

    await openAppearance(page);

    await expect(
      page.getByRole("combobox", { name: "Accent colour" }),
    ).toHaveValue("wallpaper");
    await expect(page.locator(":root")).not.toHaveAttribute("data-colours");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations with either accent in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openAppearance(page);
      expect(await accessibilityViolations(page)).toEqual([]);

      await page
        .getByRole("combobox", { name: "Accent colour" })
        .selectOption({ label: "Windows accent colour" });
      await expect(page.locator(":root")).toHaveAttribute(
        "data-colours",
        "wallpaper",
      );

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
