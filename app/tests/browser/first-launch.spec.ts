import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, onPlatform, test } from "./fixtures.ts";

/** A device that hasn't finished its first launch until the test finishes it. */
class Device {
  finishes = 0;
  failsToFinish = false;

  reset(): void {
    this.finishes = 0;
    this.failsToFinish = false;
  }
}

const device = new Device();

const FIRST_LAUNCH_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  firstLaunchFinished: () => device.finishes > 0,
  finishFirstLaunch: () => {
    if (device.failsToFinish) {
      throw new CommandFailure({
        code: "internal",
        message: "something went wrong inside the app",
      });
    }
    device.finishes += 1;
    return null;
  },
};

const STEPS = [
  { heading: "Welcome to Omnileaf", leaveWith: "Get started" },
  { heading: "You're all set", leaveWith: "Open my library" },
] as const;

test.use({ backend: FIRST_LAUNCH_BACKEND });

test.beforeEach(() => {
  device.reset();
});

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name });
}

async function goTo(page: Page, stepHeading: string): Promise<void> {
  await page.goto("/first-launch");
  for (const step of STEPS) {
    await expect(heading(page, step.heading)).toBeVisible();
    if (step.heading === stepHeading) {
      return;
    }
    await page.getByRole("button", { name: step.leaveWith }).click();
  }
}

test("goes through every step and opens the library once finished", async ({
  page,
}) => {
  await page.goto("/first-launch");

  for (const step of STEPS) {
    await expect(heading(page, step.heading)).toBeVisible();
    await page.getByRole("button", { name: step.leaveWith }).click();
  }

  await expect(page).toHaveURL("/");
  await expect(heading(page, "Library")).toBeFocused();
  expect(device.finishes).toBe(1);
});

test("leaves the app when going back from the library it finished on", async ({
  page,
}) => {
  await goTo(page, "You're all set");
  await page.getByRole("button", { name: "Open my library" }).click();
  await expect(heading(page, "Library")).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL("about:blank");
});

test("focuses each step's heading as it moves on", async ({ page }) => {
  await goTo(page, "Welcome to Omnileaf");

  await page.getByRole("button", { name: "Get started" }).click();

  await expect(heading(page, "You're all set")).toBeFocused();
});

for (const { platform, promise } of [
  { platform: "android", promise: "Your library stays on your phone." },
  { platform: "ios", promise: "Your library stays on your phone." },
  { platform: "linux", promise: "Your library stays on this computer." },
] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...FIRST_LAUNCH_BACKEND,
        appInfo: onPlatform(platform).backend.appInfo,
      },
    });

    test("promises the library stays on the device it runs on", async ({
      page,
    }) => {
      await page.goto("/first-launch");

      await expect(page.getByText(promise)).toBeVisible();
    });
  });
}

test("goes back a step with the browser's back", async ({ page }) => {
  await goTo(page, "You're all set");

  await page.goBack();

  await expect(heading(page, "Welcome to Omnileaf")).toBeVisible();
});

test("stays on the last step and says so when finishing fails", async ({
  page,
}) => {
  device.failsToFinish = true;
  await goTo(page, "You're all set");

  await page.getByRole("button", { name: "Open my library" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Couldn't finish setting up. Try again.",
  );
  await expect(page).toHaveURL("/first-launch");
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const step of STEPS) {
    test(`${step.heading} has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await goTo(page, step.heading);

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }
}
