import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

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
      const mode = page.getByRole("button", { name: /^Reading mode/ });
      const zones = page.getByRole("button", { name: /^Tap zones/ });

      await expect(mode).toHaveAttribute("aria-haspopup", "dialog");
      await expect(mode).toHaveText("Reading mode Automatic");
      await expect(zones).toContainText("Edges");
      expect((await boxOf(zones)).x).toBe(0);
      await expect(mode.getByText("Reading mode")).toHaveCSS(
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

    test("explains Automatic under its option in the reading mode dialog", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      await page.getByRole("button", { name: /^Reading mode/ }).click();

      await expect(
        page
          .getByRole("dialog", { name: "Reading mode" })
          .getByRole("radio", { name: "Automatic" }),
      ).toHaveAccessibleDescription(
        "Automatic picks paged or long strip for each series.",
      );
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

    test("sets Swiping a book as two choice rows under an accent heading", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      const right = page.getByRole("button", { name: /^Swipe right/ });

      await expect(
        page.getByRole("heading", { name: "Swiping a book" }),
      ).toHaveCSS("font-size", "14px");
      await expect(right).toContainText("Mark read");
      await right.click();
      await page
        .getByRole("dialog", { name: "Swipe right" })
        .getByRole("radio", { name: "Nothing" })
        .click();
      await expect(right).toContainText("Nothing");
    });

    test("sets the tap guide and its replay as flush one-line rows, and offers no resume notice", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      const guide = page.getByRole("switch", { name: "Tap guide" });
      const again = page.getByRole("button", { name: "Replay the tap guide" });
      const resume = page.getByRole("switch", {
        name: "Show the resume notice",
      });

      await expect(guide).toBeVisible();
      await expect(resume).toHaveCount(0);
      for (const row of [guide, again]) {
        expect((await boxOf(row)).x).toBe(0);
        await expect(row).toHaveCSS("border-top-width", "0px");
      }
      expect((await boxOf(guide.getByText("Tap guide"))).x).toBe(ROW_START);
      expect((await boxOf(again.getByText("Replay the tap guide"))).x).toBe(
        ROW_START,
      );
      await expect(guide).toHaveAccessibleDescription("");
      await expect(again).toHaveAccessibleDescription("");
    });

    test("sets Smart features flush, its switches level with the other rows", async ({
      page,
    }) => {
      await page.goto("/settings/reading");
      const heading = page.getByRole("heading", { name: "Smart features" });
      const speed = page.getByRole("switch", {
        name: "Learn my reading speed",
      });

      expect((await boxOf(heading)).height).toBe(44);
      expect((await boxOf(speed)).x).toBe(0);
      await expect(speed).toHaveCSS("border-top-width", "0px");
      expect((await boxOf(speed.getByText("Learn my reading speed"))).x).toBe(
        ROW_START,
      );
    });
  },
);

const CHECKED_SCREENS = ["/settings/reading"] as const;

test.describe(
  "Settings > Reader checked for accessibility on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      for (const route of CHECKED_SCREENS) {
        test(`has no accessibility violations on ${route} in the ${colorScheme} theme`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme });
          await page.goto(route);
          await expect(page.getByRole("main")).toBeVisible();

          expect(await accessibilityViolations(page)).toEqual([]);
        });
      }
    }
  },
);
