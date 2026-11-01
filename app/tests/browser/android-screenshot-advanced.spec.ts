import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe("Screenshot mode on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("holds the main switch in a filled soft-accent pill", async ({
    page,
  }) => {
    await page.goto("/settings/privacy/screenshot-mode");
    const main = page.getByRole("switch", { name: "Screenshot mode" }).first();

    await expect(main).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-accent-soft"),
    );
    const radius = await main.evaluate((element) =>
      parseFloat(getComputedStyle(element).borderTopLeftRadius),
    );
    expect(radius).toBeGreaterThanOrEqual(36);
  });

  test("sets Turn off after as a row with its value under its name that opens a choice dialog", async ({
    page,
  }) => {
    await page.goto("/settings/privacy/screenshot-mode");
    const row = page.getByRole("button", { name: /^Turn off after/ });

    await expect(row).toContainText("1 hour");
    await row.click();
    const dialog = page.getByRole("dialog", { name: "Turn off after" });
    await dialog.getByRole("radio", { name: "Never" }).click();

    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Never");
  });

  test("heads Turn it on quickly in the accent and shows the long-press row with a bare icon", async ({
    page,
  }) => {
    await page.goto("/settings/privacy/screenshot-mode");
    const heading = page.getByRole("heading", {
      name: "Turn it on quickly",
    });
    const name = page.getByText("Long-press the Omnileaf icon");

    await expect(heading).toHaveCSS("font-size", "14px");
    await expect(heading).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-plain"),
    );
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("font-weight", "400");
  });
});

test.describe("Advanced on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's list rows");
  });

  test("heads Undo in the accent and runs its rows edge to edge, flat", async ({
    page,
  }) => {
    await page.goto("/settings/advanced");
    const heading = page.getByRole("heading", { name: "Undo", exact: true });
    const row = page.getByRole("switch", { name: /^Offer Undo/ });

    await expect(heading).toHaveCSS("font-size", "14px");
    await expect(heading).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-button-plain"),
    );
    expect((await boxOf(row)).x).toBeLessThanOrEqual(1);
    await expect(row).toHaveCSS("border-top-width", "0px");
  });

  test("sets Keep Undo for as a row with its value under its name", async ({
    page,
  }) => {
    await page.goto("/settings/advanced");
    const row = page.getByRole("button", { name: /^Keep Undo for/ });

    await expect(row).toContainText(/\d+ seconds/);
    await expect(row).toHaveAttribute("aria-haspopup", "dialog");
  });
});
