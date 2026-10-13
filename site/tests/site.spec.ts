import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const DARK_BACKGROUND = "rgb(22, 21, 18)";

test("answers an unknown path with not found", async ({ request }) => {
  const response = await request.get("/no-such-page");

  expect(response.status()).toBe(404);
});

test("ships no JavaScript", async ({ page }) => {
  await page.goto("/");

  const scripts = await page.locator("script").count();

  expect(scripts).toBe(0);
});

test("fits the screen without scrolling sideways", async ({ page }) => {
  await page.goto("/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );

  expect(overflow).toBe(0);
});

test("follows the system dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  expect(background).toBe(DARK_BACKGROUND);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`passes the accessibility check in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");

    const { violations } = await new AxeBuilder({ page }).analyze();

    expect(violations).toEqual([]);
  });
}
