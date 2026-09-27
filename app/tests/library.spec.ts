import { AxeBuilder } from "@axe-core/playwright";

import { expect, test } from "./fixtures.ts";

const COLOR_SCHEMES = ["light", "dark"] as const;

test("opens on the empty library", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Omnileaf");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(page.getByText("Your library is empty.")).toBeVisible();
});

for (const colorScheme of COLOR_SCHEMES) {
  test(`the empty library has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
