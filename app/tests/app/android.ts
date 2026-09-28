import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import { APPIUM_URL, startAppium } from "./appium.ts";

const APP_PACKAGE = fileURLToPath(
  new URL(
    "../../src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk",
    import.meta.url,
  ),
);
const DEVICE_LOG = fileURLToPath(
  new URL("../../test-results/logcat.txt", import.meta.url),
);
const ADB_TIMEOUT_MS = 30_000;
const DEVICE_LOG_MAX_BYTES = 64 * 1024 * 1024;
const WEBVIEW_TIMEOUT_MS = 60_000;

const run = promisify(execFile);

async function clearDeviceLog(): Promise<void> {
  await run("adb", ["logcat", "-c"], { timeout: ADB_TIMEOUT_MS });
}

async function saveDeviceLog(): Promise<void> {
  const { stdout } = await run("adb", ["logcat", "-d"], {
    timeout: ADB_TIMEOUT_MS,
    maxBuffer: DEVICE_LOG_MAX_BYTES,
  });
  await writeFile(DEVICE_LOG, stdout);
}

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  await clearDeviceLog();
  const stopAppium = await startAppium([
    "uiautomator2:chromedriver_autodownload",
  ]);
  project.provide("appUnderTest", {
    server: APPIUM_URL.href,
    capabilities: {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:app": APP_PACKAGE,
      "appium:autoWebview": true,
      "appium:autoWebviewTimeout": WEBVIEW_TIMEOUT_MS,
    },
  });
  return async () => {
    await stopAppium();
    await saveDeviceLog();
  };
}
