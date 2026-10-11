import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { isRecord } from "./json.ts";
import type { Capabilities } from "./webdriver.ts";

const FIRST_XCODE_WITH_DEVICE_HUB = 27;
const LOOKUP_TIMEOUT_MS = 10_000;
const PGREP_FOUND_NOTHING = 1;

const run = promisify(execFile);

export interface Xcode {
  readonly developerDir: string;
  readonly majorVersion: number;
}

async function selectedDeveloperDir(): Promise<string> {
  const chosen = process.env.DEVELOPER_DIR;
  if (chosen !== undefined && chosen !== "") {
    return chosen;
  }
  const { stdout } = await run("xcode-select", ["--print-path"], {
    timeout: LOOKUP_TIMEOUT_MS,
  });
  return stdout.trim();
}

/** The Xcode Appium uses, from `DEVELOPER_DIR` or else `xcode-select`. */
export async function selectedXcode(): Promise<Xcode> {
  const developerDir = await selectedDeveloperDir();
  const infoPlist = resolve(developerDir, "..", "Info.plist");
  const { stdout: version } = await run(
    "plutil",
    ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", infoPlist],
    { timeout: LOOKUP_TIMEOUT_MS },
  );
  const majorVersion = Number.parseInt(version, 10);
  if (Number.isNaN(majorVersion)) {
    throw new Error(`read the Xcode version in ${infoPlist}: got ${version}`);
  }
  return { developerDir, majorVersion };
}

/** The app whose running process Appium takes for an open Simulator window. */
export function simulatorWindowApp(xcode: Xcode): string {
  return xcode.majorVersion >= FIRST_XCODE_WITH_DEVICE_HUB
    ? resolve(xcode.developerDir, "..", "Applications", "DeviceHub.app")
    : resolve(xcode.developerDir, "Applications", "Simulator.app");
}

function foundNothing(error: unknown): boolean {
  return isRecord(error) && error.code === PGREP_FOUND_NOTHING;
}

async function isSimulatorWindowOpen(windowApp: string): Promise<boolean> {
  try {
    await run("pgrep", ["-f", windowApp], {
      timeout: LOOKUP_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    if (foundNothing(error)) {
      return false;
    }
    throw error;
  }
}

/** Appium restarts a Simulator whose window is not in the state `appium:isHeadless` asks for, which ends the WebDriverAgent launched before it. */
export async function followSimulatorWindow(
  capabilities: Capabilities,
  windowApp: string,
): Promise<Capabilities> {
  return {
    ...capabilities,
    "appium:isHeadless": !(await isSimulatorWindowOpen(windowApp)),
  };
}
