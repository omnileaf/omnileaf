import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { startWebDriverProcess } from "./webdriver-process.ts";

const WEBDRIVER_PORT = 4445;
const WEBDRIVER_URL = new URL(`http://127.0.0.1:${String(WEBDRIVER_PORT)}/`);
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
  const stop = await startWebDriverProcess({
    command: APP_BINARY,
    args: [],
    env: { ...process.env, TAURI_WEBDRIVER_PORT: String(WEBDRIVER_PORT) },
    server: WEBDRIVER_URL,
  });
  project.provide("appUnderTest", {
    server: WEBDRIVER_URL.href,
    capabilities: {},
  });
  return stop;
}
