import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND, firstLaunchFinished: () => false } });

test.describe("accent fills on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's accent");
  });

  test("fills the first launch's progress bar in the accent across the bar", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    const bar = page.getByRole("progressbar").locator("[data-fill]");

    await expect(bar).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
    expect((await boxOf(bar.locator(".."))).width).toBeGreaterThan(150);
  });
});

test.describe("radio dots on an Android phone", { tag: "@native" }, () => {
  test.use({ backend: { ...DEFAULT_BACKEND } });

  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's accent");
  });

  test("fills the chosen dot in the accent", async ({ page }) => {
    await page.goto("/settings/general");
    const dot = page
      .getByRole("radio", { name: "Library" })
      .locator("[data-radio-mark] > span");

    await expect(dot).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
  });
});
