import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { WEBDRIVER_PORT, WEBDRIVER_URL } from "./address.ts";
import { waitUntilReady } from "./webdriver.ts";

const EXECUTABLE_SUFFIX = process.platform === "win32" ? ".exe" : "";
const APP_BINARY = fileURLToPath(
  new URL(
    `../../../target/debug/omnileaf-app${EXECUTABLE_SUFFIX}`,
    import.meta.url,
  ),
);
const STARTUP_TIMEOUT_MS = 60_000;

function failIfItStops(app: ChildProcess): Promise<never> {
  return new Promise((_, reject) => {
    app.once("error", (error) => {
      reject(new Error(`start the app at ${APP_BINARY}`, { cause: error }));
    });
    app.once("exit", (code) => {
      reject(new Error(`the app exited with ${String(code)} while starting`));
    });
  });
}

async function stop(app: ChildProcess): Promise<void> {
  if (app.exitCode !== null) {
    return;
  }
  const exited = once(app, "exit");
  app.kill();
  await exited;
}

export async function setup(): Promise<() => Promise<void>> {
  const app = spawn(APP_BINARY, {
    env: { ...process.env, TAURI_WEBDRIVER_PORT: String(WEBDRIVER_PORT) },
    stdio: "inherit",
  });
  await Promise.race([
    waitUntilReady(WEBDRIVER_URL, STARTUP_TIMEOUT_MS),
    failIfItStops(app),
  ]);
  return () => stop(app);
}
