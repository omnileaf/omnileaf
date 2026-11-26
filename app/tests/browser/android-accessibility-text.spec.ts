import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { ANDROID_SCREENS } from "./android-screens.ts";

const LARGER_SCALE = 1.15;
const LARGEST_SCALE = 1.3;

async function openAccessibility(page: Page): Promise<void> {
  await page.goto("/settings/accessibility");
  await expect(pageTitle(page)).toBeVisible();
}

function pageTitle(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Accessibility" });
}

function textSizes(page: Page): Locator {
  return page
    .getByRole("region", { name: "Text" })
    .getByRole("radiogroup", { name: "Interface text size" });
}

function fontSizeOf(text: Locator): Promise<number> {
  return text.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
}

for (const { name, viewport } of ANDROID_SCREENS) {
  test.describe(
    `the Text settings on an Android ${name}`,
    { tag: "@native" },
    () => {
      if (viewport !== undefined) {
        test.use({ viewport });
      }
      test.beforeEach(({ platform }) => {
        test.skip(platform !== "android", "Android's settings");
      });

      test("starts from the phone's text size", async ({ page }) => {
        await openAccessibility(page);

        await expect(
          textSizes(page).getByRole("radio", { name: "System" }),
        ).toBeChecked();
        await expect(
          page.getByText("Starts from your phone’s font size."),
        ).toBeVisible();
      });

      test("lines Interface text size up with the switch rows below it", async ({
        page,
      }) => {
        await openAccessibility(page);

        const choiceLabel = await page
          .getByText("Interface text size")
          .boundingBox();
        const switchLabel = await page.getByText("Reduce motion").boundingBox();

        expect(choiceLabel?.x).toBe(switchLabel?.x);
      });

      for (const [name, scale] of [
        ["Larger", LARGER_SCALE],
        ["Largest", LARGEST_SCALE],
      ] as const) {
        test(`grows the interface's text ${String(scale)} times over the phone's size once ${name} is chosen, and keeps it after a reload`, async ({
          page,
        }) => {
          await openAccessibility(page);
          const atSystemSize = await fontSizeOf(pageTitle(page));

          await textSizes(page).getByRole("radio", { name }).click();
          await expect
            .poll(() => fontSizeOf(pageTitle(page)))
            .toBeCloseTo(atSystemSize * scale);
          await page.reload();

          await expect(
            textSizes(page).getByRole("radio", { name }),
          ).toBeChecked();
          expect(await fontSizeOf(pageTitle(page))).toBeCloseTo(
            atSystemSize * scale,
          );
        });
      }

      test("goes back to the phone's text size once System is chosen again", async ({
        page,
      }) => {
        await openAccessibility(page);
        const atSystemSize = await fontSizeOf(pageTitle(page));
        await textSizes(page).getByRole("radio", { name: "Largest" }).click();

        await textSizes(page).getByRole("radio", { name: "System" }).click();

        await expect
          .poll(() => fontSizeOf(pageTitle(page)))
          .toBeCloseTo(atSystemSize);
      });
    },
  );
}
