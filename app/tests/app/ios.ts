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
const IOS_RUNTIME = /\.iOS-/;
const WEBDRIVERAGENT_LAUNCH_TIMEOUT_MS = 120_000;
const WEBVIEW_TIMEOUT_MS = 60_000;

const run = promisify(execFile);

function bootedIosSimulator(listing: unknown): string | undefined {
  const devices = isRecord(listing) ? listing.devices : undefined;
  if (!isRecord(devices)) {
    return undefined;
  }
  return Object.entries(devices)
    .filter(([runtime]) => IOS_RUNTIME.test(runtime))
    .flatMap(([, simulators]) => listOf(simulators))
    .map((simulator) => (isRecord(simulator) ? simulator.udid : undefined))
    .find((udid) => typeof udid === "string");
}

async function findBootedSimulator(): Promise<string> {
  const { stdout } = await run("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "--json",
  ]);
  const udid = bootedIosSimulator(JSON.parse(stdout));
  if (udid === undefined) {
    throw new Error("boot an iOS Simulator before running the iOS tests");
  }
  return udid;
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
      "appium:udid": simulator,
      "appium:app": APP_BUNDLE,
      "appium:autoWebview": true,
      "appium:autoWebviewTimeout": WEBVIEW_TIMEOUT_MS,
      "appium:wdaLaunchTimeout": WEBDRIVERAGENT_LAUNCH_TIMEOUT_MS,
    },
  });
  return stop;
}
