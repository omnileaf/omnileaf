import { expect, test } from "./fixtures.ts";

test("keeps Library current in Settings and leads back to it", async ({
  page,
}) => {
  await page.goto("/settings/library/folders");

  await expect(
    page
      .getByRole("navigation", { name: "Settings" })
      .getByRole("link", { name: "Library" }),
  ).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: "Back to Library" }).click();

  await expect(page).toHaveURL(/\/settings\/library$/);
});
