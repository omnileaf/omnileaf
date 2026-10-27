import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { inject } from "vitest";

const SIMCTL_TIMEOUT_MS = 30_000;

const run = promisify(execFile);

export function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the iOS session has no ${name}`);
  }
  return value;
}

export async function appContainer(): Promise<string> {
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      capability("appium:bundleId"),
      "data",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  return stdout.trim();
}

export async function onMyIphoneOmnileaf(): Promise<string> {
  return join(await appContainer(), "Documents");
}
