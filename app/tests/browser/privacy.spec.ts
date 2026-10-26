import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
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

  await page.getByRole("radio", { name: "Never" }).click();
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

test("lists Screenshot mode with how it stands", async ({ page }) => {
  await openPrivacy(page);
  const screenshotMode = page
    .getByRole("main")
    .getByRole("link", { name: /^Screenshot mode/ });

  await expect(screenshotMode).toContainText("Off");
  await screenshotMode.click();
  await page
    .getByRole("switch", { name: "Screenshot mode", exact: true })
    .click();
  await openPrivacy(page);

  await expect(screenshotMode).toContainText("On");
});

test("says nothing leaves the computer unless a report is sent", async ({
  page,
}) => {
  await openPrivacy(page);

  await expect(
    page.getByText(
      "Nothing leaves this computer unless you send a report or connect a tracker.",
    ),
  ).toBeVisible();
});

test("drops that promise while crash reports are sent on their own", async ({
  page,
}) => {
  await openPrivacy(page);

  await page.getByRole("radio", { name: "Always send" }).click();

  await expect(page.getByText(/^Nothing leaves this/)).toHaveCount(0);
});

test.describe("on a touch screen", () => {
  test.use(onPlatform("android"));

  test("says nothing leaves the phone or tablet unless a report is sent", async ({
    page,
  }) => {
    await openPrivacy(page);
    const device =
      viewportOf(page).width >= MEDIUM_MIN_WIDTH ? "tablet" : "phone";

    await expect(
      page.getByText(
        `Nothing leaves this ${device} unless you send a report or connect a tracker.`,
      ),
    ).toBeVisible();
  });

  test("summarises Screenshot mode in the settings list", async ({ page }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "settings opens its first section beside the list",
    );
    await page.goto("/settings/privacy/screenshot-mode");
    await page
      .getByRole("switch", { name: "Screenshot mode", exact: true })
      .click();

    await page.goto("/settings");

    await expect(
      page.getByRole("main").getByRole("link", { name: /^Privacy/ }),
    ).toContainText("Screenshot mode on");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`Settings › Privacy has no accessibility violations in ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openPrivacy(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}
