import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  EXPANDED_MIN_WIDTH,
  expect,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

const PRIVACY_PAGE = "/settings/privacy";

async function openPrivacy(page: Page): Promise<void> {
  await page.goto(PRIVACY_PAGE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy" }),
  ).toBeVisible();
}

function crashReports(page: Page) {
  return page.getByRole("radiogroup", { name: "Crash reports" });
}

test("asks about each crash report until told otherwise", async ({ page }) => {
  await openPrivacy(page);

  await expect(
    crashReports(page).getByRole("radio", { name: "Ask each time" }),
  ).toBeChecked();
  await expect(crashReports(page)).toHaveAccessibleDescription(
    "You see a report before it's sent.",
  );
});

test("keeps the crash report choice after the app reopens", async ({
  page,
}) => {
  await openPrivacy(page);

  await page.locator("label").filter({ hasText: "Never" }).click();
  await page.reload();

  await expect(
    crashReports(page).getByRole("radio", { name: "Never" }),
  ).toBeChecked();
});

test("changes the choice from the keyboard", async ({ page }) => {
  await openPrivacy(page);
  await crashReports(page)
    .getByRole("radio", { name: "Ask each time" })
    .focus();

  await page.keyboard.press("ArrowRight");

  await expect(
    crashReports(page).getByRole("radio", { name: "Always send" }),
  ).toBeChecked();
});

test.describe("on a touch screen", () => {
  test.use(onPlatform("android"));

  test("summarises the crash report choice in the settings list", async ({
    page,
  }) => {
    await openPrivacy(page);
    await page.locator("label").filter({ hasText: "Always send" }).click();

    await page.goto("/settings");
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "settings opens its first section beside the list",
    );

    await expect(
      page.getByRole("main").getByRole("link", { name: /^Privacy/ }),
    ).toContainText("Always send crash reports");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`Settings › Privacy has no accessibility violations in ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openPrivacy(page);

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
