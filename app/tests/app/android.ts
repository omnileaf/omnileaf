import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { startWebDriverProcess } from "./webdriver-process.ts";

const APPIUM_PORT = 4723;
const APPIUM_URL = new URL(`http://127.0.0.1:${String(APPIUM_PORT)}/`);
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
  const stop = await startWebDriverProcess({
    command: "appium",
    args: [
      "--address",
      "127.0.0.1",
      "--port",
      String(APPIUM_PORT),
      "--allow-insecure",
      "uiautomator2:chromedriver_autodownload",
      "--log-level",
      "warn",
    ],
    env: process.env,
    server: APPIUM_URL,
  });
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
