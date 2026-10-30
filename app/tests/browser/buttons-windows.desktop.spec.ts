import type { Locator, Page } from "@playwright/test";

import type { FoundLibrary } from "../../src/lib/ipc/bindings.ts";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

interface ThemeLook {
  readonly accent: string;
  readonly onAccent: string;
  readonly accentPressed: string;
  readonly accentBottomEdge: string;
  readonly subtleHover: string;
  readonly subtlePressed: string;
  readonly pressedInk: string;
  readonly standard: string;
  readonly standardBottomEdge: string;
  readonly standardPressed: string;
  readonly ring: string;
  readonly innerRing: string;
}

const THEMES = {
  light: {
    accent: "rgb(47, 111, 79)",
    onAccent: "rgb(255, 255, 255)",
    accentPressed: "rgba(47, 111, 79, 0.88)",
    accentBottomEdge: "rgba(0, 0, 0, 0.4)",
    subtleHover: "rgba(0, 0, 0, 0.035)",
    subtlePressed: "rgba(0, 0, 0, 0.024)",
    pressedInk: "rgba(0, 0, 0, 0.62)",
    standard: "rgba(255, 255, 255, 0.7)",
    standardBottomEdge: "rgba(0, 0, 0, 0.16)",
    standardPressed: "rgba(249, 249, 249, 0.3)",
    ring: "rgba(0, 0, 0, 0.894)",
    innerRing: "rgba(255, 255, 255, 0.7) 0px 0px 0px 1px",
  },
  dark: {
    accent: "rgb(127, 203, 157)",
    onAccent: "rgb(0, 0, 0)",
    accentPressed: "rgba(127, 203, 157, 0.8)",
    accentBottomEdge: "rgba(0, 0, 0, 0.137)",
    subtleHover: "rgba(255, 255, 255, 0.06)",
    subtlePressed: "rgba(255, 255, 255, 0.04)",
    pressedInk: "rgba(255, 255, 255, 0.773)",
    standard: "rgba(255, 255, 255, 0.06)",
    standardBottomEdge: "rgba(255, 255, 255, 0.07)",
    standardPressed: "rgba(255, 255, 255, 0.03)",
    ring: "rgb(255, 255, 255)",
    innerRing: "rgba(0, 0, 0, 0.7) 0px 0px 0px 1px",
  },
} as const satisfies Record<"light" | "dark", ThemeLook>;

const FOUND: FoundLibrary = {
  series: 212,
  books: 38,
  lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
};

const START_NEW_LIBRARY = "Start a new library instead";

const ICON_INSET = "7px";

function escapedForPattern(text: string): string {
  return text.replaceAll(/[().]/g, String.raw`\$&`);
}

const MOST_TABS_TO_THE_BUTTON = 10;

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let tab = 0; tab < MOST_TABS_TO_THE_BUTTON; tab += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error("Tab never reached the button");
}

async function pressWithoutClicking(
  page: Page,
  target: Locator,
): Promise<void> {
  await target.hover();
  await page.mouse.down();
}

test.describe("Windows buttons", () => {
  testOnlyInItsWebview("windows");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: onPlatform("windows").backend.appInfo,
      firstLaunchFinished: () => false,
    },
  });

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
        await page.goto("/first-launch");
      });

      test("draws the accent button 32 tall on the accent with 4px corners and a darker bottom edge", async ({
        page,
      }) => {
        const accent = page.getByRole("button", { name: "Get started" });

        await expect(accent).toHaveCSS("background-color", look.accent);
        await expect(accent).toHaveCSS("color", look.onAccent);
        await expect(accent).toHaveCSS("border-top-left-radius", "4px");
        await expect(accent).toHaveCSS(
          "border-bottom-color",
          look.accentBottomEdge,
        );
        await expect(accent).toHaveCSS("font-size", "14px");
        await expect(accent).toHaveCSS("min-height", "32px");
      });

      test("keeps the accent button's text at full strength while it is pressed", async ({
        page,
      }) => {
        const accent = page.getByRole("button", { name: "Get started" });

        await pressWithoutClicking(page, accent);

        await expect(accent).toHaveCSS("background-color", look.accentPressed);
        await expect(accent).toHaveCSS("color", look.onAccent);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      });

      test("rings the focused button with the two-tone focus rectangle", async ({
        page,
      }) => {
        const accent = page.getByRole("button", { name: "Get started" });

        await tabTo(page, accent);

        await expect(accent).toHaveCSS("outline-width", "2px");
        await expect(accent).toHaveCSS("outline-color", look.ring);
        await expect(accent).toHaveCSS("outline-offset", "1px");
        await expect(accent).toHaveCSS(
          "box-shadow",
          new RegExp(escapedForPattern(look.innerRing)),
        );
      });

      test("draws Back as a subtle icon button that tints under the pointer and dims its icon when pressed", async ({
        page,
      }) => {
        await page.getByRole("button", { name: "Get started" }).click();
        const back = page.getByRole("button", { name: "Back" });

        const box = await back.boundingBox();

        await expect(back).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(back).toHaveCSS("padding-top", ICON_INSET);
        await expect(back).toHaveCSS("padding-inline-start", ICON_INSET);
        expect(box?.width).toBe(box?.height);
        await back.hover();
        await expect(back).toHaveCSS("background-color", look.subtleHover);
        await pressWithoutClicking(page, back);
        await expect(back).toHaveCSS("background-color", look.subtlePressed);
        await expect(back).toHaveCSS("color", look.pressedInk);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      });

      test("has no accessibility violations with its buttons at rest and focused", async ({
        page,
      }) => {
        await expect(
          page.getByRole("button", { name: "Get started" }),
        ).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);

        await tabTo(page, page.getByRole("button", { name: "Get started" }));

        expect(await accessibilityViolations(page)).toEqual([]);
      });

      test("has no accessibility violations on the step with the subtle Back button", async ({
        page,
      }) => {
        await page.getByRole("button", { name: "Get started" }).click();
        await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }
});

test.describe("Windows's standard button", () => {
  testOnlyInItsWebview("windows");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: onPlatform("windows").backend.appInfo,
      firstLaunchFinished: () => false,
      foundLibrary: () => FOUND,
    },
  });

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
        await page.goto("/first-launch");
        await page.getByRole("button", { name: "Get started" }).click();
      });

      test("draws Start a new library on the control fill, dimming its text when pressed", async ({
        page,
      }) => {
        const standard = page.getByRole("button", { name: START_NEW_LIBRARY });

        await expect(standard).toHaveCSS("background-color", look.standard);
        await expect(standard).toHaveCSS(
          "border-bottom-color",
          look.standardBottomEdge,
        );
        await pressWithoutClicking(page, standard);
        await expect(standard).toHaveCSS(
          "background-color",
          look.standardPressed,
        );
        await expect(standard).toHaveCSS("color", look.pressedInk);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      });

      test("has no accessibility violations with the standard button at rest and focused", async ({
        page,
      }) => {
        const standard = page.getByRole("button", { name: START_NEW_LIBRARY });
        await expect(standard).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);

        await tabTo(page, standard);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }
});
