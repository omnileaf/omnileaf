import type { Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { boxOf, expect, onPlatform, test } from "./fixtures.ts";

const SWITCH_NAME = "Check folders for new books while Omnileaf is open";
const SWITCH_HELP =
  "New books show up without a rescan. Turn off to save battery.";
const TOUCH_TARGET = 44;

const IS_ON_BY_DEFAULT = {
  android: false,
  ios: false,
  linux: true,
  macos: true,
  windows: true,
} satisfies Record<Platform, boolean>;

function scheduledRescansSwitch(page: Page) {
  return page.getByRole("switch", { name: SWITCH_NAME });
}

for (const platform of ["ios", "android", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    const told: boolean[] = [];

    test.use({
      backend: {
        ...onPlatform(platform).backend,
        setScheduledRescans: (isOn) => {
          told.push(isOn);
        },
      },
    });

    test.beforeEach(() => {
      told.length = 0;
    });

    test("tells the library whether to check folders while the app is open", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect.poll(() => told.at(-1)).toBe(IS_ON_BY_DEFAULT[platform]);
    });

    test("offers the checks in Advanced with what they mean", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");

      const checks = scheduledRescansSwitch(page);

      await expect(checks).toHaveAttribute(
        "aria-checked",
        String(IS_ON_BY_DEFAULT[platform]),
      );
      await expect(checks).toHaveAccessibleDescription(SWITCH_HELP);
    });

    test("turns the checks over at once and keeps the choice", async ({
      page,
    }) => {
      await page.goto("/settings/advanced");
      const wasOn = IS_ON_BY_DEFAULT[platform];

      await scheduledRescansSwitch(page).click();

      await expect(scheduledRescansSwitch(page)).toHaveAttribute(
        "aria-checked",
        String(!wasOn),
      );
      await expect.poll(() => told.at(-1)).toBe(!wasOn);
      await page.reload();
      await expect(scheduledRescansSwitch(page)).toHaveAttribute(
        "aria-checked",
        String(!wasOn),
      );
      await expect.poll(() => told.at(-1)).toBe(!wasOn);
    });

    test("spans the pane in a row tall enough to touch", async ({ page }) => {
      await page.goto("/settings/advanced");
      const checks = scheduledRescansSwitch(page);

      const row = await boxOf(checks);
      const pane = await boxOf(checks.locator(".."));

      expect(row.x).toBeCloseTo(pane.x, 0);
      expect(row.width).toBeCloseTo(pane.width, 0);
      expect(row.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
    });
  });
}
