import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe("Language on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("lists the languages as radio rows, the system one first with its language under it", async ({
    page,
  }) => {
    await page.goto("/settings/general/language");
    const system = page.getByRole("radio", { name: /Use the system language/ });
    const mark = system.locator("[data-radio-mark]");

    await expect(system).toBeChecked();
    await expect(mark).toHaveCSS("border-top-width", "2px");
    expect((await boxOf(mark)).width).toBeCloseTo(20, 0);
    await expect(system.getByText("Use the system language")).toHaveCSS(
      "font-weight",
      "400",
    );
    await expect(system.locator("svg:visible")).toHaveCount(0);
  });
});
