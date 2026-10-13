import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const DARK_BACKGROUND = "rgb(22, 21, 18)";

test("answers an unknown path with not found", async ({ request }) => {
  const response = await request.get("/no-such-page");

  expect(response.status()).toBe(404);
});

test("leads home from a page that is not found", async ({ page }) => {
  await page.goto("/no-such-page");

  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Go to the home page" }),
  ).toHaveAttribute("href", "/");
});

test("prerenders the not-found page for the web server", async ({
  request,
}) => {
  const response = await request.get("/404");

  expect(await response.text()).toContain("Page not found");
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
  for (const path of ["/", "/404"]) {
    test(`passes the accessibility check on ${path} in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);

      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(violations).toEqual([]);
    });
  }
}
