import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { pollUntil, waitUntilReady } from "./webdriver.ts";

const STARTUP_TIMEOUT_MS = 60_000;
const STOP_GRACE_MS = 10_000;

const run = promisify(execFile);

export interface WebDriverProcess {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly server: URL;
  readonly startupTimeoutMs?: number;
}

export interface RunningProcess {
  stop(): Promise<void>;
  /** Ends the process at once, as the system ends an app it needs the memory of, with no chance to save anything. */
  kill(): Promise<void>;
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

/** Lists every process below `pid`, since a server such as Appium starts helpers like xcodebuild in their own process group. */
async function descendantsOf(pid: number): Promise<number[]> {
  const { stdout } = await run("ps", ["-A", "-o", "pid=,ppid="]);
  const childrenOf = new Map<number, number[]>();
  for (const line of stdout.trim().split("\n")) {
    const [child = 0, parent = 0] = line.trim().split(/\s+/).map(Number);
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
  }
  const found: number[] = [];
  const pending = [pid];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const children = childrenOf.get(next) ?? [];
    found.push(...children);
    pending.push(...children);
  }
  return found;
}

function signalled(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function isRunning(pid: number): boolean {
  return signalled(pid, 0);
}

function signalEach(pids: readonly number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    signalled(pid, signal);
  }
}

function waitUntilGone(pids: readonly number[]): Promise<true> {
  return pollUntil(
    () => Promise.resolve(pids.some(isRunning) ? undefined : true),
    STOP_GRACE_MS,
    `processes ${pids.join(", ")} to stop`,
  );
}

/** Windows has neither `ps` nor SIGTERM, so `taskkill` ends the server and every process below it at once. */
async function stopTreeOnWindows(pid: number): Promise<void> {
  await run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  await waitUntilGone([pid]);
}

async function end(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return;
  }
  if (process.platform === "win32") {
    await stopTreeOnWindows(child.pid);
    return;
  }
  const pids = [child.pid, ...(await descendantsOf(child.pid))];
  signalEach(pids, signal);
  await waitUntilGone(pids).catch(() => {
    signalEach(pids, "SIGKILL");
    return waitUntilGone(pids);
  });
}

export async function startWebDriverProcess(
  launch: WebDriverProcess,
): Promise<RunningProcess> {
  const child = spawn(launch.command, launch.args, {
    env: launch.env,
    stdio: "inherit",
  });
  try {
    await Promise.race([
      waitUntilReady(
        launch.server,
        launch.startupTimeoutMs ?? STARTUP_TIMEOUT_MS,
      ),
      failIfItStops(child, launch.command),
    ]);
  } catch (error) {
    await end(child).catch((stopError: unknown) => {
      throw new AggregateError(
        [error, stopError],
        `${launch.command} didn't start, and stopping what it started failed`,
      );
    });
    throw error;
  }
  return { stop: () => end(child), kill: () => end(child, "SIGKILL") };
}
