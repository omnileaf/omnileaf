import { expect, test } from "./fixtures.ts";

test("opens on the empty library", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Omnileaf");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Your library is empty" }),
  ).toBeVisible();
});
