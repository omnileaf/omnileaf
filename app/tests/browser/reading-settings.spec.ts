import { expect, test } from "./fixtures.ts";

test("shows up next at the end of a book until Skip Up next is turned on, and remembers it", async ({
  page,
}) => {
  await page.goto("/settings/reading");
  const skip = page.getByRole("switch", { name: "Skip Up next" });
  await expect(skip).not.toBeChecked();

  await skip.click();
  await page.reload();

  await expect(
    page.getByRole("switch", { name: "Skip Up next" }),
  ).toBeChecked();
});

test("lists Reading among the settings sections", async ({ page }) => {
  await page.goto("/settings");

  await page
    .getByRole("link", { name: /^Reading/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/settings\/reading$/);
});
