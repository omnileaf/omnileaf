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

test("keeps the library in the Documents folder the Files app shows", async () => {
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

  const database = join(stdout.trim(), "Documents", LIBRARY_DATABASE);

  await expect(access(database)).resolves.toBeUndefined();
});
