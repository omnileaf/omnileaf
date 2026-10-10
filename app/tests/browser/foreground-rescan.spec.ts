import type { Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { expect, onPlatform, test } from "./fixtures.ts";

const SWITCH_NAME = "Check folders for new books while Omnileaf is open";

const RESCANS_ON_RETURN = {
  android: true,
  ios: true,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

const calls = { rescans: 0, schedules: [] as boolean[] };
let finishRescans: () => void = () => undefined;
let rescansFinished = Promise.resolve();

function counting(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    rescanLibraryFolders: async () => {
      calls.rescans += 1;
      await rescansFinished;
      return [];
    },
    setScheduledRescans: (isOn) => {
      calls.schedules.push(isOn);
    },
  };
}

/** Hides the page and shows it again, as a phone does when the app leaves the screen and comes back. */
async function leaveAndComeBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", {
        value: state,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
}

/** Sends one more command through the bridge and waits for it, so every command the page sent before it has arrived. */
async function settleCommands(page: Page): Promise<void> {
  const told = calls.schedules.length;
  await page.getByRole("switch", { name: SWITCH_NAME }).click();
  await expect.poll(() => calls.schedules.length).toBeGreaterThan(told);
}

async function openAfterTheLaunchRescan(page: Page): Promise<void> {
  await page.goto("/settings/advanced");
  await expect(page.getByRole("switch", { name: SWITCH_NAME })).toBeVisible();
  await expect.poll(() => calls.rescans).toBe(1);
}

test.beforeEach(() => {
  calls.rescans = 0;
  calls.schedules = [];
  rescansFinished = Promise.resolve();
});

for (const platform of ["ios", "android", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({ backend: counting(platform) });

    test(`${RESCANS_ON_RETURN[platform] ? "rescans every folder again" : "leaves the folders alone"} when the app comes back to the screen`, async ({
      page,
    }) => {
      await openAfterTheLaunchRescan(page);

      await leaveAndComeBack(page);
      await settleCommands(page);

      expect(calls.rescans).toBe(RESCANS_ON_RETURN[platform] ? 2 : 1);
    });
  });
}

test.describe("on a phone coming back while a rescan runs", () => {
  test.use({ backend: counting("ios") });

  test.beforeEach(() => {
    rescansFinished = new Promise((finish) => {
      finishRescans = finish;
    });
  });

  test("starts no second rescan for a return while its rescan still runs", async ({
    page,
  }) => {
    await openAfterTheLaunchRescan(page);

    await leaveAndComeBack(page);
    await leaveAndComeBack(page);
    await settleCommands(page);

    finishRescans();
    expect(calls.rescans).toBe(2);
  });
});
