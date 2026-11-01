import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe(
  "Report a problem on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's fields and buttons");
    });

    test("draws the reply email as a 56px outlined field with a 4px corner, flat on the page", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const field = page.getByRole("textbox", {
        name: "Email for a reply (optional)",
      });

      expect((await boxOf(field)).height).toBeCloseTo(56, 0);
      await expect(field).toHaveCSS("border-top-left-radius", "4px");
      await expect(field).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(field.locator("xpath=..").first()).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    });

    test("fills Send to Omnileaf in the accent, full width", async ({
      page,
    }) => {
      await page.goto("/settings/about/report");
      const send = page.getByRole("button", { name: "Send to Omnileaf" });

      await expect(send).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-button-primary"),
      );
    });
  },
);
