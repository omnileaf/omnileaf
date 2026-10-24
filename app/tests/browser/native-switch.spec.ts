import type { Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { accessibilityViolations, boxOf, expect, test } from "./fixtures.ts";

const TRACKS: Readonly<Partial<Record<Platform, readonly [number, number]>>> = {
  ios: [63, 28],
  android: [52, 32],
  linux: [32, 18.4],
};

async function openAnimations(page: Page): Promise<void> {
  await page.goto("/settings/advanced");
  await page.getByRole("link", { name: "Animations" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Animations" }),
  ).toBeVisible();
}

test.describe("a switch", { tag: "@native" }, () => {
  test("draws its track at the platform's own size", async ({
    page,
    platform,
  }) => {
    await openAnimations(page);
    const expected = TRACKS[platform ?? "linux"];

    const track = await boxOf(
      page
        .getByRole("switch", { name: "Navigation" })
        .locator(':scope > span[aria-hidden="true"]'),
    );

    expect(expected).toBeDefined();
    expect(track.width).toBeCloseTo(expected?.[0] ?? 0, 0);
    expect(track.height).toBeCloseTo(expected?.[1] ?? 0, 0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openAnimations(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
