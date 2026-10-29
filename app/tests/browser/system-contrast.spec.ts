import type { Page } from "@playwright/test";

import type { SystemContrast } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import { expect, onPlatform, test, testOnlyInItsWebview } from "./fixtures.ts";

const PRIMARY_BUTTON = "--native-color-button-primary";
const LIGHT_PRIMARY = {
  standard: "#326a4d",
  medium: "#114c32",
  high: "#002a18",
} satisfies Record<SystemContrast, string>;

let contrasts: FakeChannel<SystemContrast> | undefined;

testOnlyInItsWebview("android");

test.use({
  backend: {
    ...onPlatform("android").backend,
    watchSystemContrast: (channel) => {
      contrasts = channel;
      return null;
    },
  },
});

test.beforeEach(() => {
  contrasts = undefined;
});

async function reportContrast(contrast: SystemContrast): Promise<void> {
  await expect.poll(() => contrasts).toBeDefined();
  await contrasts?.send(contrast);
}

function primaryButtonColour(page: Page): Promise<string> {
  return page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    PRIMARY_BUTTON,
  );
}

test.describe("Android's colour contrast", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
  });

  for (const contrast of ["medium", "high"] as const) {
    test(`draws the ${contrast} contrast colours once Android reports ${contrast} contrast`, async ({
      page,
    }) => {
      await reportContrast(contrast);

      await expect
        .poll(() => primaryButtonColour(page))
        .toBe(LIGHT_PRIMARY[contrast]);
    });
  }

  test("goes back to the standard colours when Android's contrast goes back to standard", async ({
    page,
  }) => {
    await reportContrast("high");
    await expect.poll(() => primaryButtonColour(page)).toBe(LIGHT_PRIMARY.high);

    await reportContrast("standard");

    await expect
      .poll(() => primaryButtonColour(page))
      .toBe(LIGHT_PRIMARY.standard);
  });
});
