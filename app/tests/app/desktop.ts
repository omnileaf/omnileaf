import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { createSampleLibrary } from "./sample-library.ts";
import { startWebDriverProcess } from "./webdriver-process.ts";

const WEBDRIVER_PORT = 4445;
const WEBDRIVER_URL = new URL(`http://127.0.0.1:${String(WEBDRIVER_PORT)}/`);
const PICKED_FOLDER_VARIABLE = "OMNILEAF_E2E_PICKED_FOLDER";
const CRASH_REPORT_FOLDER_VARIABLE = "OMNILEAF_E2E_CRASH_REPORTS";
const EXECUTABLE_SUFFIX = process.platform === "win32" ? ".exe" : "";
const APP_BINARY = fileURLToPath(
  new URL(
    `../../../target/debug/omnileaf-app${EXECUTABLE_SUFFIX}`,
    import.meta.url,
  ),
);

export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const library = await createSampleLibrary();
  const crashReports = await mkdtemp(join(tmpdir(), "omnileaf-e2e-crashes-"));
  const removeTestFolders = async (): Promise<void> => {
    await rm(crashReports, { recursive: true, force: true });
    await library.remove();
  };
  const stop = await startWebDriverProcess({
    command: APP_BINARY,
    args: [],
    env: {
      ...process.env,
      TAURI_WEBDRIVER_PORT: String(WEBDRIVER_PORT),
      [PICKED_FOLDER_VARIABLE]: library.folder,
      [CRASH_REPORT_FOLDER_VARIABLE]: crashReports,
    },
    server: WEBDRIVER_URL,
  }).catch(async (error: unknown) => {
    await removeTestFolders();
    throw error;
  });
  project.provide("appUnderTest", {
    server: WEBDRIVER_URL.href,
    capabilities: {},
  });
  return async () => {
    try {
      await stop();
    } finally {
      await removeTestFolders();
    }
  };
}
