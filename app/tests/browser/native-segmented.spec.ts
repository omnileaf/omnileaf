import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { accessibilityViolations, boxOf, expect, test } from "./fixtures.ts";

interface SegmentedSize {
  readonly track: number;
  readonly segment: number;
}

const NATIVE_SIZES: Readonly<Partial<Record<Platform, SegmentedSize>>> = {
  ios: { track: 32, segment: 28 },
  android: { track: 40, segment: 40 },
};

async function openAppearance(page: Page): Promise<Locator> {
  await page.goto("/settings/appearance");
  const choice = page.getByRole("radiogroup").first();
  await expect(choice).toBeVisible();
  return choice;
}

test.describe("a segmented control", { tag: "@native" }, () => {
  test("draws its track and segments at the platform's own size", async ({
    page,
    platform,
  }) => {
    const native = platform === undefined ? undefined : NATIVE_SIZES[platform];
    test.skip(native === undefined, "today's look on this platform");
    const choice = await openAppearance(page);

    const track = await boxOf(choice);
    const segment = await boxOf(choice.getByRole("radio").first());

    expect(track.height).toBeCloseTo(native?.track ?? 0, 0);
    expect(segment.height).toBeCloseTo(native?.segment ?? 0, 0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openAppearance(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});
