import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

const ROW_START = 16;
const ROW_TEXT_START = 56;

test.describe(
  "Trackers in the Settings list on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("is a disabled row under Reading, laid out like the rows beside it", async ({
      page,
    }) => {
      await page.goto("/settings");
      const trackers = page.getByRole("button", { name: /^Trackers/ });
      const reader = page.getByRole("link", { name: /^Reader/ });

      await expect(trackers).toHaveAttribute("aria-disabled", "true");
      await expect(trackers).toContainText("Coming soon");
      expect((await boxOf(trackers)).y).toBeGreaterThan(
        (await boxOf(reader)).y,
      );
      expect((await boxOf(trackers)).x).toBe(0);
      expect((await boxOf(trackers.locator("[data-icon=link-2]"))).x).toBe(
        ROW_START,
      );
      expect((await boxOf(trackers.getByText("Trackers"))).x).toBe(
        ROW_TEXT_START,
      );
    });

    test("goes nowhere when pressed", async ({ page }) => {
      await page.goto("/settings");

      await page
        .getByRole("button", { name: /^Trackers/ })
        .click({ force: true });

      await expect(page).toHaveURL(/\/settings$/);
    });
  },
);
