import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";

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

test("offers Add a folder beside the empty library's title", async ({
  page,
}) => {
  await page.goto("/");
  const addFolder = page.getByRole("button", { name: "Add a folder" });

  const title = await boxOf(
    page.getByRole("heading", { level: 1, name: "Library" }),
  );
  const headerButton = await boxOf(addFolder.first());

  await expect(addFolder).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: "Your library is empty" })
      .getByRole("button", { name: "Add a folder" }),
  ).toBeVisible();
  expect(headerButton.x).toBeGreaterThan(title.x);
  expect(headerButton.y).toBeLessThan(title.y + title.height);
  expect(headerButton.y + headerButton.height).toBeGreaterThan(title.y);
});

test("draws the empty library's art at the size the boards draw it", async ({
  page,
}) => {
  await page.goto("/");
  const isPhone = viewportOf(page).width < MEDIUM_MIN_WIDTH;

  const icon = await boxOf(
    page
      .getByRole("region", { name: "Your library is empty" })
      .locator("svg")
      .first(),
  );

  expect(icon.width).toBe(isPhone ? 28 : 36);
});
