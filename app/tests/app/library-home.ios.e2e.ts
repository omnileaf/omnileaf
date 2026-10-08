import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, inject, test } from "vitest";

import { useAppSession } from "./app-session.ts";

const LIBRARY_DATABASE = "library.sqlite";
const SIMCTL_TIMEOUT_MS = 30_000;

const run = promisify(execFile);

useAppSession();

function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the iOS session has no ${name}`);
  }
  return value;
}

test("keeps the library database inside the app, out of the folder the Files app shows", async () => {
  const bundleId = capability("appium:bundleId");
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      bundleId,
      "data",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  const container = stdout.trim();

  const inFiles = join(container, "Documents", LIBRARY_DATABASE);
  const inApp = join(
    container,
    "Library",
    "Application Support",
    bundleId,
    LIBRARY_DATABASE,
  );

  await expect(access(inFiles)).rejects.toThrow();
  await expect(access(inApp)).resolves.toBeUndefined();
});
