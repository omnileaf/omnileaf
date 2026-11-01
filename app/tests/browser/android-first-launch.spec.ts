import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";

test.use({
  backend: { ...DEFAULT_BACKEND, firstLaunchFinished: () => false },
});

test.describe("first launch on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's setup steps");
  });

  test("fills Get started in the accent", async ({ page }) => {
    await page.goto("/");
    const start = page.getByRole("button", { name: "Get started" });

    await expect(start).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-primary"),
    );
  });

  test("sets the step headline in regular weight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    const headline = page.getByRole("heading", {
      level: 1,
      name: "Where your library lives",
    });

    await expect(headline).toHaveCSS("font-weight", "400");
  });

  test("shows the step as a linear progress bar with its count", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    const progress = page.getByRole("progressbar");

    await expect(progress.locator("[data-fill]")).toBeVisible();
    await expect(progress).toContainText("1 of 3");
  });
});
