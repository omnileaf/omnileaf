import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import { APPIUM_URL, startAppium } from "./appium.ts";
import { isRecord, listOf } from "./json.ts";

const APP_BUNDLE = fileURLToPath(
  new URL(
    "../../src-tauri/gen/apple/build/arm64-sim/Omnileaf.app",
    import.meta.url,
  ),
);
const IOS_RUNTIME = /\.iOS-(\d+(?:-\d+)*)$/;
const WEBDRIVERAGENT_LAUNCH_TIMEOUT_MS = 240_000;
const WEBVIEW_PROCESS = "process-Omnileaf";
const PREBUILT_WEBDRIVERAGENT = process.env.OMNILEAF_PREBUILT_WDA;
const WEBVIEW_TIMEOUT_MS = 60_000;

const run = promisify(execFile);

interface Simulator {
  readonly udid: string;
  readonly platformVersion: string;
}

function webDriverAgentCapabilities(): Record<string, unknown> {
  if (PREBUILT_WEBDRIVERAGENT === undefined) {
    return {};
  }
  return {
    "appium:usePreinstalledWDA": true,
    "appium:prebuiltWDAPath": PREBUILT_WEBDRIVERAGENT,
  };
}

function simulatorsOn(runtime: string, devices: unknown): Simulator[] {
  const version = IOS_RUNTIME.exec(runtime)?.[1];
  if (version === undefined) {
    return [];
  }
  const platformVersion = version.replaceAll("-", ".");
  return listOf(devices).flatMap((device) => {
    const udid = isRecord(device) ? device.udid : undefined;
    return typeof udid === "string" ? [{ udid, platformVersion }] : [];
  });
}

function bootedIosSimulator(listing: unknown): Simulator | undefined {
  const runtimes = isRecord(listing) ? listing.devices : undefined;
  if (!isRecord(runtimes)) {
    return undefined;
  }
  return Object.entries(runtimes).flatMap(([runtime, devices]) =>
    simulatorsOn(runtime, devices),
  )[0];
}

async function findBootedSimulator(): Promise<Simulator> {
  const { stdout } = await run("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "--json",
  ]);
  const simulator = bootedIosSimulator(JSON.parse(stdout));
  if (simulator === undefined) {
    throw new Error("boot an iOS Simulator before running the iOS tests");
  }
  return simulator;
}

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const simulator = await findBootedSimulator();
  const stop = await startAppium([]);
  project.provide("appUnderTest", {
    server: APPIUM_URL.href,
    capabilities: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:udid": simulator.udid,
      "appium:platformVersion": simulator.platformVersion,
      "appium:app": APP_BUNDLE,
      "appium:isHeadless": true,
      "appium:autoWebview": true,
      "appium:additionalWebviewBundleIds": [WEBVIEW_PROCESS],
      "appium:webviewConnectTimeout": WEBVIEW_TIMEOUT_MS,
      "appium:wdaLaunchTimeout": WEBDRIVERAGENT_LAUNCH_TIMEOUT_MS,
      "appium:showXcodeLog": true,
      ...webDriverAgentCapabilities(),
    },
  });
  return stop;
}
