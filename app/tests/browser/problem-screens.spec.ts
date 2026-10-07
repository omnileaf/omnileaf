import {
  accessibilityViolations,
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";

const MISSING_ADDRESS = "/sample/missing-page";
const DESKTOP_PROBLEM_TOP = 170;

test("explains that an address leads nowhere and shows it", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);

  await expect(
    page.getByRole("heading", { level: 1, name: "This page doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByText(MISSING_ADDRESS)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link"),
  ).toHaveCount(4);
});

test("leads back to the library from a missing page", async ({ page }) => {
  await page.goto(MISSING_ADDRESS);

  await page
    .getByRole("main")
    .getByRole("link", { name: "Go to Library" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeFocused();
});

test("moves focus to the problem as it opens", async ({ page }) => {
  await page.goto(MISSING_ADDRESS);

  await expect(
    page.getByRole("heading", { level: 1, name: "This page doesn't exist" }),
  ).toBeFocused();
});

test("sets the problem lower on desktops, as the board does", async ({
  page,
}) => {
  await page.goto(MISSING_ADDRESS);
  test.skip(viewportOf(page).width < EXPANDED_MIN_WIDTH, "desktops only");

  const problem = await boxOf(
    page.getByRole("main").locator("section").locator(":scope > *").first(),
  );

  expect(problem.y).toBe(DESKTOP_PROBLEM_TOP);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`a missing page has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(MISSING_ADDRESS);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}
