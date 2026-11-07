import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

const ROW_START = 16;

test.describe(
  "Settings > Reader on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("sets the reading mode and tap zones as flush two-line rows that open a choice dialog", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      const mode = page.getByRole("button", {
        name: /^Reading mode for new series/,
      });
      const zones = page.getByRole("button", { name: /^Tap zones/ });

      await expect(mode).toHaveAttribute("aria-haspopup", "dialog");
      await expect(mode).toContainText("Automatic");
      await expect(mode).toContainText("Automatic picks paged or long strip");
      await expect(zones).toContainText("Edges");
      expect((await boxOf(zones)).x).toBe(0);
      await expect(mode.getByText("Reading mode for new series")).toHaveCSS(
        "letter-spacing",
        "0.5px",
      );
      await expect(page.getByRole("combobox")).toHaveCount(0);

      await zones.click();
      await page
        .getByRole("dialog", { name: "Tap zones" })
        .getByRole("radio", { name: "L shape" })
        .click();
      await expect(zones).toContainText("L shape");
    });

    test("draws no card around any section and heads End of a book in the accent at 14px", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      const heading = page.getByRole("heading", { name: "End of a book" });
      const skip = page.getByRole("switch", { name: "Skip Up next" });

      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS("font-weight", "500");
      await expect(heading).toHaveCSS("padding-top", "16px");
      expect((await boxOf(heading)).height).toBe(44);
      expect((await boxOf(skip)).x).toBe(0);
      await expect(skip).toHaveCSS("border-top-width", "0px");
      expect((await boxOf(skip.getByText("Skip Up next"))).x).toBe(ROW_START);
    });
  },
);
