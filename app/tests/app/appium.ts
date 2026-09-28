import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { startWebDriverProcess } from "./webdriver-process.ts";

const APPIUM_PORT = 4723;
const APPIUM_LOG = fileURLToPath(
  new URL("../../test-results/appium.log", import.meta.url),
);

export const APPIUM_URL = new URL(`http://127.0.0.1:${String(APPIUM_PORT)}/`);

export async function startAppium(
  insecureFeatures: readonly string[],
): Promise<() => Promise<void>> {
  await mkdir(dirname(APPIUM_LOG), { recursive: true });
  return startWebDriverProcess({
    command: "appium",
    args: [
      "--address",
      "127.0.0.1",
      "--port",
      String(APPIUM_PORT),
      ...insecureFeatures.flatMap((feature) => ["--allow-insecure", feature]),
      "--log-level",
      "warn:debug",
      "--log",
      APPIUM_LOG,
    ],
    env: process.env,
    server: APPIUM_URL,
  });
}
