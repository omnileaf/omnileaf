import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, inject, test } from "vitest";

import { mainNavigationLink, useAppSession } from "./app-session.ts";
import { isMiddleOfScreenDark, readStatusBar } from "./status-bar.ts";
import { xpath } from "./webdriver.ts";

const SYSTEM_APPEARANCES = ["light", "dark"] as const;
const THEMES = [
  { label: "Light", theme: "light" },
  { label: "Dark", theme: "dark" },
] as const;
const READABLE_CONTRAST = 0.5;
const SCREEN_SETTLE_MS = 10_000;
const SIMCTL_TIMEOUT_MS = 30_000;
const PICKER_TIMEOUT_MS = 20_000;
const PICKER_TEST_TIMEOUT_MS = 120_000;
const SCREENSHOT = fileURLToPath(
  new URL("../../test-results/status-bar.bmp", import.meta.url),
);

const SETTINGS_LINK = mainNavigationLink("Settings");
const APPEARANCE_LINK = xpath(
  "//main//a[starts-with(normalize-space(), 'Appearance')]",
);
const LIBRARY_SETTINGS_LINK = xpath("//main//a[normalize-space()='Library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const RECENT_TAB = xpath(
  "//XCUIElementTypeButton[@name='Recent' or @name='Recents']",
);
const CANCEL_BUTTON = xpath("//XCUIElementTypeButton[@name='Cancel']");

function themeOption(label: string): ReturnType<typeof xpath> {
  return xpath(`//main//label[normalize-space()='${label}']`);
}

const run = promisify(execFile);

const appSession = useAppSession();

let systemAppearanceBefore: unknown;

function simulatorUdid(): string {
  const udid = inject("appUnderTest").capabilities["appium:udid"];
  if (typeof udid !== "string") {
    throw new Error("the iOS session has no appium:udid");
  }
  return udid;
}

async function chooseTheme(label: string): Promise<void> {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(APPEARANCE_LINK)).click();
  await (await appSession().waitFor(themeOption(label))).click();
}

async function screenshot(): Promise<Buffer> {
  await run(
    "xcrun",
    ["simctl", "io", simulatorUdid(), "screenshot", "--type=bmp", SCREENSHOT],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  return readFile(SCREENSHOT);
}

/** Gives the screen time to draw what `isSettled` waits for, answering with the last screenshot taken. */
async function settledScreenshot(
  isSettled: (shot: Buffer) => boolean,
): Promise<Buffer> {
  const deadline = performance.now() + SCREEN_SETTLE_MS;
  let shot = await screenshot();
  while (!isSettled(shot) && performance.now() < deadline) {
    shot = await screenshot();
  }
  return shot;
}

async function openFolderPicker(): Promise<void> {
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().inNativeContext(async () => {
    await appSession().waitFor(RECENT_TAB, PICKER_TIMEOUT_MS);
  });
}

async function cancelFolderPicker(): Promise<void> {
  await appSession().inNativeContext(async () => {
    await (await appSession().waitFor(RECENT_TAB, PICKER_TIMEOUT_MS)).click();
    await (
      await appSession().waitFor(CANCEL_BUTTON, PICKER_TIMEOUT_MS)
    ).click();
  });
}

beforeAll(async () => {
  systemAppearanceBefore = await appSession().runMobileCommand(
    "getAppearance",
    {},
  );
});

afterAll(async () => {
  await chooseTheme("System");
  await appSession().runMobileCommand(
    "setAppearance",
    systemAppearanceBefore ?? { style: "light" },
  );
});

describe.each(SYSTEM_APPEARANCES)("on a %s system", (system) => {
  test.each(THEMES)(
    "puts the window and its status bar in the $label style",
    async ({ label, theme }) => {
      const isDark = theme === "dark";
      await appSession().runMobileCommand("setAppearance", { style: system });

      await chooseTheme(label);

      await appSession().waitUntil(
        `return matchMedia("(prefers-color-scheme: ${theme})").matches;`,
        `the window in the ${theme} style`,
      );
      const statusBar = readStatusBar(
        await settledScreenshot((shot) => {
          const reading = readStatusBar(shot);
          return (
            reading.isPageDark === isDark &&
            reading.contrast > READABLE_CONTRAST
          );
        }),
      );
      expect(statusBar.isPageDark).toBe(isDark);
      expect(statusBar.contrast).toBeGreaterThan(READABLE_CONTRAST);
    },
  );
});

test(
  "shows the folder picker in the dark theme on a light system",
  { timeout: PICKER_TEST_TIMEOUT_MS },
  async () => {
    await appSession().runMobileCommand("setAppearance", { style: "light" });
    await chooseTheme("Dark");

    await openFolderPicker();
    const picker = await settledScreenshot(isMiddleOfScreenDark);
    await cancelFolderPicker();

    expect(isMiddleOfScreenDark(picker)).toBe(true);
  },
);
