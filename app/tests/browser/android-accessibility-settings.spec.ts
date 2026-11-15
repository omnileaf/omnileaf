import type { Page } from "@playwright/test";

import type { SystemContrast } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import { expect, onPlatform, test } from "./fixtures.ts";

let contrasts: FakeChannel<SystemContrast> | undefined;

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

async function openAccessibility(page: Page): Promise<void> {
  await page.goto("/settings");
  await page.getByRole("link", { name: /^Accessibility/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Accessibility" }),
  ).toBeVisible();
}

function contrastOf(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-contrast"),
  );
}

test.describe(
  "Settings › Accessibility on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's settings");
    });

    test("lists Reduce motion and Higher contrast under Motion and contrast", async ({
      page,
    }) => {
      await openAccessibility(page);
      const section = page.getByRole("region", {
        name: "Motion and contrast",
      });

      await expect(
        section.getByRole("switch", { name: "Reduce motion" }),
      ).toBeVisible();
      await expect(
        section.getByRole("switch", { name: "Higher contrast" }),
      ).toBeVisible();
    });

    test("holds every animation still with Reduce motion on", async ({
      page,
    }) => {
      await openAccessibility(page);

      await page.getByRole("switch", { name: "Reduce motion" }).click();
      await page.goto("/settings/advanced");

      await expect(
        page.getByRole("link", { name: /^Animations/ }),
      ).toContainText("All off");
    });

    test("starts Higher contrast from the phone's Contrast setting", async ({
      page,
    }) => {
      await openAccessibility(page);
      const higher = page.getByRole("switch", { name: "Higher contrast" });
      await expect(higher).not.toBeChecked();

      await reportContrast("medium");

      await expect(higher).toBeChecked();
    });

    test("draws the high contrast colours once Higher contrast is turned on, and the standard ones once it is off", async ({
      page,
    }) => {
      await openAccessibility(page);
      await reportContrast("medium");
      const higher = page.getByRole("switch", { name: "Higher contrast" });

      await higher.click();
      await expect(higher).not.toBeChecked();
      expect(await contrastOf(page)).toBeNull();
      await higher.click();

      await expect(higher).toBeChecked();
      expect(await contrastOf(page)).toBe("high");
    });

    test("keeps the choice made here over the phone's setting", async ({
      page,
    }) => {
      await openAccessibility(page);
      await page.getByRole("switch", { name: "Higher contrast" }).click();

      await reportContrast("standard");

      expect(await contrastOf(page)).toBe("high");
    });
  },
);
