import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import { APPIUM_URL, startAppium } from "./appium.ts";
import { withAttempts } from "./attempts.ts";
import { isRecord, listOf } from "./json.ts";
import { pollUntil, waitUntilReady } from "./webdriver.ts";

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
const WEBDRIVERAGENT_PORT = 8100;
const WEBDRIVERAGENT_URL = new URL(
  `http://127.0.0.1:${String(WEBDRIVERAGENT_PORT)}/`,
);
const WEBDRIVERAGENT_LAUNCH_ATTEMPTS = 3;
const WEBDRIVERAGENT_READY_TIMEOUT_MS = 60_000;
const SIMCTL_TIMEOUT_MS = 60_000;
const WEBVIEW_TIMEOUT_MS = 60_000;
const APP_LAUNCHABLE_TIMEOUT_MS = 60_000;
const UNKNOWN_TO_LAUNCHER = "FBSOpenApplicationServiceErrorDomain";

const run = promisify(execFile);

interface Simulator {
  readonly udid: string;
  readonly platformVersion: string;
}

async function bundleIdOf(app: string): Promise<string> {
  const { stdout } = await run("plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    "-o",
    "-",
    join(app, "Info.plist"),
  ]);
  return stdout.trim();
}

/** Appium's own launch of a prebuilt WebDriverAgent can hang with no timeout, so it is launched here instead. */
async function launchWebDriverAgent(
  simulator: Simulator,
  agent: string,
): Promise<void> {
  await run("xcrun", ["simctl", "install", simulator.udid, agent], {
    timeout: SIMCTL_TIMEOUT_MS,
  });
  const bundleId = await bundleIdOf(agent);
  await withAttempts(WEBDRIVERAGENT_LAUNCH_ATTEMPTS, async () => {
    await run(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        simulator.udid,
        bundleId,
      ],
      {
        timeout: SIMCTL_TIMEOUT_MS,
        env: {
          ...process.env,
          SIMCTL_CHILD_USE_PORT: String(WEBDRIVERAGENT_PORT),
          SIMCTL_CHILD_WDA_PRODUCT_BUNDLE_IDENTIFIER: bundleId,
        },
      },
    );
    await waitUntilReady(WEBDRIVERAGENT_URL, WEBDRIVERAGENT_READY_TIMEOUT_MS);
  });
}

function isUnknownToLauncher(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.stderr === "string" &&
    error.stderr.includes(UNKNOWN_TO_LAUNCHER)
  );
}

async function launches(
  simulator: Simulator,
  bundleId: string,
): Promise<true | undefined> {
  try {
    await run(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        simulator.udid,
        bundleId,
      ],
      { timeout: SIMCTL_TIMEOUT_MS },
    );
    return true;
  } catch (error) {
    if (isUnknownToLauncher(error)) {
      return undefined;
    }
    throw error;
  }
}

/** The Simulator's launcher refuses a just-installed app until it has registered it, so this waits until the app launches. */
async function installApp(simulator: Simulator): Promise<string> {
  await run("xcrun", ["simctl", "install", simulator.udid, APP_BUNDLE], {
    timeout: SIMCTL_TIMEOUT_MS,
  });
  const bundleId = await bundleIdOf(APP_BUNDLE);
  await pollUntil(
    () => launches(simulator, bundleId),
    APP_LAUNCHABLE_TIMEOUT_MS,
    `launching ${bundleId} on the Simulator`,
  );
  await run("xcrun", ["simctl", "terminate", simulator.udid, bundleId], {
    timeout: SIMCTL_TIMEOUT_MS,
  });
  return bundleId;
}

async function webDriverAgentCapabilities(
  simulator: Simulator,
): Promise<Record<string, unknown>> {
  if (PREBUILT_WEBDRIVERAGENT === undefined) {
    return { "appium:wdaLaunchTimeout": WEBDRIVERAGENT_LAUNCH_TIMEOUT_MS };
  }
  await launchWebDriverAgent(simulator, PREBUILT_WEBDRIVERAGENT);
  return { "appium:webDriverAgentUrl": WEBDRIVERAGENT_URL.origin };
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

function bootedIosSimulator(
  listing: unknown,
  chosenUdid: string | undefined,
): Simulator | undefined {
  const runtimes = isRecord(listing) ? listing.devices : undefined;
  if (!isRecord(runtimes)) {
    return undefined;
  }
  return Object.entries(runtimes)
    .flatMap(([runtime, devices]) => simulatorsOn(runtime, devices))
    .find(
      (simulator) => chosenUdid === undefined || simulator.udid === chosenUdid,
    );
}

async function findBootedSimulator(): Promise<Simulator> {
  const { stdout } = await run("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "--json",
  ]);
  const simulator = bootedIosSimulator(
    JSON.parse(stdout),
    process.env.OMNILEAF_SIMULATOR_UDID,
  );
  if (simulator === undefined) {
    throw new Error("boot an iOS Simulator before running the iOS tests");
  }
  return simulator;
}

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const simulator = await findBootedSimulator();
  const bundleId = await installApp(simulator);
  const webDriverAgent = await webDriverAgentCapabilities(simulator);
  const stop = await startAppium([]);
  project.provide("appUnderTest", {
    server: APPIUM_URL.href,
    capabilities: {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:udid": simulator.udid,
      "appium:platformVersion": simulator.platformVersion,
      "appium:bundleId": bundleId,
      "appium:noReset": true,
      "appium:isHeadless": true,
      "appium:autoWebview": true,
      "appium:additionalWebviewBundleIds": [WEBVIEW_PROCESS],
      "appium:webviewConnectTimeout": WEBVIEW_TIMEOUT_MS,
      "appium:showXcodeLog": true,
      ...webDriverAgent,
    },
  });
  return stop;
}
