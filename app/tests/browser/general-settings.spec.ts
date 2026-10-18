import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

const TOUCH_TARGET_PX = 48;

function opensOn(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Omnileaf opens on" });
}

function timeFormat(page: Page): Locator {
  return page.getByRole("radiogroup", { name: "Time format" });
}

test("opens on the library until another place is chosen, and keeps the place chosen", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(
    opensOn(page).getByRole("radio", { name: "Library", exact: true }),
  ).toBeChecked();

  await opensOn(page)
    .getByRole("radio", { name: "Last book", exact: true })
    .click();
  await page.reload();

  await expect(
    opensOn(page).getByRole("radio", { name: "Last book", exact: true }),
  ).toBeChecked();
  await expect(
    opensOn(page).getByRole("radio", { name: "Last book", exact: true }),
  ).toHaveAccessibleDescription(
    "The reader, where you left it; the library when there's none.",
  );
});

test("follows the system's clock until a time format is chosen, and keeps it", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(
    timeFormat(page).getByRole("radio", {
      name: /^Follow the system \((12|24)-hour\)$/,
    }),
  ).toBeChecked();

  await timeFormat(page)
    .getByRole("radio", { name: "12-hour", exact: true })
    .click();
  await page.reload();

  await expect(
    timeFormat(page).getByRole("radio", { name: "12-hour", exact: true }),
  ).toBeChecked();
});

test("has no accessibility violations", async ({ page }) => {
  await page.goto("/settings/general");
  await expect(opensOn(page)).toBeVisible();

  expect(await accessibilityViolations(page)).toEqual([]);
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use(onPlatform(platform));

    test("draws each choice at least 48px tall as the phone board does", async ({
      page,
    }) => {
      await page.goto("/settings/general");
      await expect(opensOn(page)).toBeVisible();

      const choices = [
        ...(await opensOn(page).getByRole("radio").all()),
        ...(await timeFormat(page).getByRole("radio").all()),
      ];

      for (const choice of choices) {
        const { height } = await boxOf(choice);

        expect(height, await choice.innerText()).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX,
        );
      }
    });
  });
}
