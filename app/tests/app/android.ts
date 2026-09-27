import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { APPIUM_URL, startAppium } from "./appium.ts";

const APP_PACKAGE = fileURLToPath(
  new URL(
    "../../src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk",
    import.meta.url,
  ),
);
const WEBVIEW_TIMEOUT_MS = 60_000;

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const stop = await startAppium(["uiautomator2:chromedriver_autodownload"]);
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
  return stop;
}
