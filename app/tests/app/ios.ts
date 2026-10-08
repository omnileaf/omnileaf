import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TestProject } from "vitest/node";

import { APPIUM_URL, startAppium } from "./appium.ts";
import { withAttempts } from "./attempts.ts";
import { isRecord, listOf } from "./json.ts";
import { launchOnceRegistered } from "./simulator-launch.ts";
import { waitUntilReady } from "./webdriver.ts";

const APP_BUNDLE = fileURLToPath(
  new URL(
    "../../src-tauri/gen/apple/build/arm64-sim/Omnileaf.app",
    import.meta.url,
  ),
);
const TEST_RESULTS = fileURLToPath(
  new URL("../../test-results/", import.meta.url),
);
const APP_STDOUT = join(TEST_RESULTS, "ios-app.stdout.log");
const APP_STDERR = join(TEST_RESULTS, "ios-app.stderr.log");
const LAUNCH_HANG_LOGS = join(TEST_RESULTS, "ios-launch-hang.log");
const LAUNCH_HANG_LOG_PROCESSES =
  'process == "SpringBoard" OR process == "Omnileaf" OR process == "installcoordinationd"';
const LAUNCH_HANG_LOG_WINDOW = "3m";
const SIMULATOR_LOG_BYTES = 64 * 1024 * 1024;
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
const SIMULATOR_RESTART_TIMEOUT_MS = 300_000;
const WEBVIEW_TIMEOUT_MS = 60_000;

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

/** Saves the Simulator's recent log from the launcher, the installer and the app, for a launch that hung. */
async function saveLaunchLogs(simulator: Simulator): Promise<string> {
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "spawn",
      simulator.udid,
      "log",
      "show",
      "--last",
      LAUNCH_HANG_LOG_WINDOW,
      "--style",
      "compact",
      "--predicate",
      LAUNCH_HANG_LOG_PROCESSES,
    ],
    { timeout: SIMCTL_TIMEOUT_MS, maxBuffer: SIMULATOR_LOG_BYTES },
  );
  await writeFile(LAUNCH_HANG_LOGS, stdout);
  return LAUNCH_HANG_LOGS;
}

/** A Simulator whose launcher hung does not recover by being asked again, so it is shut down and booted to a finished boot. */
async function restartSimulator(simulator: Simulator): Promise<void> {
  await run("xcrun", ["simctl", "shutdown", simulator.udid], {
    timeout: SIMULATOR_RESTART_TIMEOUT_MS,
  });
  await run("xcrun", ["simctl", "bootstatus", simulator.udid, "-b"], {
    timeout: SIMULATOR_RESTART_TIMEOUT_MS,
  });
}

/** Launches a just-installed app once to show it starts, keeping its output and, if the launch hangs, the Simulator's log. */
async function installApp(simulator: Simulator): Promise<string> {
  await run("xcrun", ["simctl", "install", simulator.udid, APP_BUNDLE], {
    timeout: SIMCTL_TIMEOUT_MS,
  });
  const bundleId = await bundleIdOf(APP_BUNDLE);
  await mkdir(TEST_RESULTS, { recursive: true });
  await launchOnceRegistered(bundleId, {
    launch: () =>
      run(
        "xcrun",
        [
          "simctl",
          "launch",
          "--terminate-running-process",
          `--stdout=${APP_STDOUT}`,
          `--stderr=${APP_STDERR}`,
          simulator.udid,
          bundleId,
        ],
        { timeout: SIMCTL_TIMEOUT_MS },
      ),
    restart: () => restartSimulator(simulator),
    saveLogs: () => saveLaunchLogs(simulator),
  });
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
