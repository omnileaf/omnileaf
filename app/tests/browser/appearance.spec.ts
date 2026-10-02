import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.ts";

const LIGHT_GROUND = "rgb(250, 248, 244)";
const DARK_GROUND = "rgb(22, 21, 18)";

async function chooseTheme(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  await page.goto("/settings");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Appearance" })
    .click();
  await page.locator("label").filter({ hasText: label }).click();
  await expect(page.getByRole("radio", { name: label })).toBeChecked();
}

test("Dark overrides a light device and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });

  await chooseTheme(page, "Dark");

  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("Light overrides a dark device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });

  await chooseTheme(page, "Light");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    LIGHT_GROUND,
  );
});

test("System follows the device as it changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await chooseTheme(page, "System");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator("body")).toHaveCSS("background-color", DARK_GROUND);
});

for (const label of ["Light", "Dark"]) {
  test(`Settings › Appearance has no accessibility violations in ${label}`, async ({
    page,
  }) => {
    await chooseTheme(page, label);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
