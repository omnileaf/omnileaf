import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";

import { waitUntilReady } from "./webdriver.ts";

const STARTUP_TIMEOUT_MS = 60_000;

export interface WebDriverProcess {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly server: URL;
}

function failIfItStops(child: ChildProcess, command: string): Promise<never> {
  return new Promise((_, reject) => {
    child.once("error", (error) => {
      reject(new Error(`start ${command}`, { cause: error }));
    });
    child.once("exit", (code) => {
      reject(
        new Error(`${command} exited with ${String(code)} while starting`),
      );
    });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

export async function startWebDriverProcess(
  launch: WebDriverProcess,
): Promise<() => Promise<void>> {
  const child = spawn(launch.command, launch.args, {
    env: launch.env,
    stdio: "inherit",
  });
  await Promise.race([
    waitUntilReady(launch.server, STARTUP_TIMEOUT_MS),
    failIfItStops(child, launch.command),
  ]);
  return () => stop(child);
}
