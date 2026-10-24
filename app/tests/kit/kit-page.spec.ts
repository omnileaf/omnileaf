import { expect, test } from "@playwright/test";

import {
  accessibilityViolations,
  settle,
  tokenColour,
} from "../browser/fixtures.ts";

const SCREENSHOTS = "../target/screenshots/kit";
const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  test(`shows every phone part in the ${theme} theme`, async ({ page }) => {
    const platform = test.info().project.name;
    const shot = `${SCREENSHOTS}/${platform}-${theme}`;
    await page.goto(`/kit?platform=${platform}&theme=${theme}`);
    await page.getByRole("list", { name: "Series" }).scrollIntoViewIfNeeded();
    await expect(page.locator('[data-slot="selection-mark"]')).not.toHaveCount(
      0,
    );

    await page.screenshot({ path: `${shot}.png`, fullPage: true });
    await page.getByRole("button", { name: "Open sheet" }).click();
    const sheet = page.getByRole("dialog", { name: "Volume 3" });
    await expect(sheet).toBeVisible();
    await settle(sheet);
    await page.screenshot({ path: `${shot}-sheet.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Sample Series 01/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.scrollIntoViewIfNeeded();
    await settle(menu);
    await page.screenshot({ path: `${shot}-menu.png` });
    await page.keyboard.press("Escape");

    await expect(page.locator(":root")).toHaveAttribute(
      "data-platform",
      platform,
    );
    await expect(page.locator(":root")).toHaveAttribute("data-theme", theme);
    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

function kitPageOf(...settings: string[]): string {
  const platform = test.info().project.name;
  return `/kit?${[`platform=${platform}`, ...settings].join("&")}`;
}

test("keeps the theme the address asks for when the system's theme changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(kitPageOf("theme=light"));
  await expect(page.locator(":root")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator(":root")).toHaveAttribute("data-theme", "light");
});

test("follows a theme change in the address without reloading", async ({
  page,
}) => {
  await page.goto(kitPageOf("theme=light"));
  await expect(page.locator(":root")).toHaveAttribute("data-theme", "light");

  await page.evaluate((address) => {
    const link = document.createElement("a");
    link.href = address;
    link.textContent = "Dark kit page";
    document.body.append(link);
  }, kitPageOf("theme=dark"));
  await page.getByRole("link", { name: "Dark kit page" }).click();

  await expect(page.locator(":root")).toHaveAttribute("data-theme", "dark");
});

test("leaves the address's theme behind once the app moves on from the kit page", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(kitPageOf("theme=dark"));
  await expect(page.locator(":root")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("link", { name: "Browse" }).click();

  await expect(page).toHaveURL(/\/browse$/);
  await expect(page.locator(":root")).toHaveAttribute("data-theme", "light");
});

test("keeps the contrast the sample library remembers when the address leaves it out", async ({
  page,
}) => {
  await page.goto(kitPageOf("contrast=more", "transparency=reduced"));
  await expect(page.locator(":root")).toHaveAttribute("data-contrast", "more");

  await page.goto("/kit");
  await expect(
    page.getByRole("heading", { name: "Phone kit parts" }),
  ).toBeVisible();

  await expect(page.locator(":root")).toHaveAttribute("data-contrast", "more");
  await expect(page.locator(":root")).toHaveAttribute(
    "data-transparency",
    "reduced",
  );
});

test("lays its grouped plates on the grouped ground", async ({ page }) => {
  await page.goto(kitPageOf("theme=light"));
  await expect(
    page.getByRole("heading", { name: "Phone kit parts" }),
  ).toBeVisible();

  const ground = await page
    .getByRole("main")
    .evaluate((main) => getComputedStyle(main).backgroundColor);

  expect(ground).toBe(await tokenColour(page, "--native-color-grouped-ground"));
});
