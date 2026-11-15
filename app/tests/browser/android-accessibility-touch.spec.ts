import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const TARGET_PX = 48;
const LARGER_TARGET_PX = 56;
const SHORT_HOLD_MS = 350;
const SHORTER_THAN_LONG_MS = 650;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

async function openAccessibility(page: Page): Promise<void> {
  await page.goto("/settings/accessibility");
  await expect(
    page.getByRole("heading", { level: 1, name: "Accessibility" }),
  ).toBeVisible();
}

function targetSizes(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    ["--native-spacing-target", "--spacing-touch-target"].map((name) => {
      const probe = document.createElement("div");
      probe.style.blockSize = `var(${name})`;
      document.body.append(probe);
      const size = probe.getBoundingClientRect().height;
      probe.remove();
      return size;
    }),
  );
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function holdSecondSeries(page: Page, heldMs: number): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  const pressed = seriesList(page)
    .getByRole("listitem")
    .nth(1)
    .locator("a, [role='checkbox']")
    .first();
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await pressed.dispatchEvent("pointerdown", touch);
  await page.clock.runFor(heldMs);
  await pressed.dispatchEvent("pointerup", touch);
}

test.describe(
  "the Touch settings on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android's settings");
      await page.clock.install();
    });

    test("lists Larger tap targets, off, and Long press takes, Medium, under Touch", async ({
      page,
    }) => {
      await openAccessibility(page);
      const section = page.getByRole("region", { name: "Touch" });

      await expect(
        section.getByRole("switch", { name: "Larger tap targets" }),
      ).not.toBeChecked();
      await expect(
        section
          .getByRole("radiogroup", { name: "Long press takes" })
          .getByRole("radio", { name: "Medium" }),
      ).toBeChecked();
    });

    test("grows the tap targets from 48px to 56px once Larger tap targets is on, and keeps them after a reload", async ({
      page,
    }) => {
      await openAccessibility(page);
      expect(await targetSizes(page)).toEqual([TARGET_PX, TARGET_PX]);

      await page.getByRole("switch", { name: "Larger tap targets" }).click();
      expect(await targetSizes(page)).toEqual([
        LARGER_TARGET_PX,
        LARGER_TARGET_PX,
      ]);
      await page.reload();

      await expect(
        page.getByRole("switch", { name: "Larger tap targets" }),
      ).toBeChecked();
      expect(await targetSizes(page)).toEqual([
        LARGER_TARGET_PX,
        LARGER_TARGET_PX,
      ]);
    });

    test("starts choosing series after a short hold once Short is chosen", async ({
      page,
    }) => {
      await openAccessibility(page);
      await page
        .getByRole("radiogroup", { name: "Long press takes" })
        .getByRole("radio", { name: "Short" })
        .click();

      await holdSecondSeries(page, SHORT_HOLD_MS);

      await expect(page.getByText("1 selected").first()).toBeVisible();
    });

    test("waits out a longer hold before choosing once Long is chosen", async ({
      page,
    }) => {
      await openAccessibility(page);
      await page
        .getByRole("radiogroup", { name: "Long press takes" })
        .getByRole("radio", { name: "Long" })
        .click();

      await holdSecondSeries(page, SHORTER_THAN_LONG_MS);

      await expect(page.getByText("1 selected")).toHaveCount(0);
    });
  },
);
