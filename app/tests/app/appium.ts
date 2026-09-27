import { startWebDriverProcess } from "./webdriver-process.ts";

const APPIUM_PORT = 4723;

export const APPIUM_URL = new URL(`http://127.0.0.1:${String(APPIUM_PORT)}/`);

export function startAppium(
  insecureFeatures: readonly string[],
): Promise<() => Promise<void>> {
  return startWebDriverProcess({
    command: "appium",
    args: [
      "--address",
      "127.0.0.1",
      "--port",
      String(APPIUM_PORT),
      ...insecureFeatures.flatMap((feature) => ["--allow-insecure", feature]),
      "--log-level",
      "warn",
    ],
    env: process.env,
    server: APPIUM_URL,
  });
}
