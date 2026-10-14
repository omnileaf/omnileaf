import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, onTestFinished, test } from "vitest";

import { startWebDriverProcess } from "./webdriver-process.ts";
import { pollUntil } from "./webdriver.ts";

const UNREACHABLE_SERVER = new URL("http://127.0.0.1:9/");
const STARTUP_TIMEOUT_MS = 3_000;
const HELPER_START_TIMEOUT_MS = 10_000;

const SPAWNS_A_DETACHED_HELPER = `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  detached: true,
  stdio: "ignore",
});
writeFileSync(process.argv[1], String(helper.pid));
setInterval(() => {}, 1000);
`;

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readyServer(): Promise<URL> {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ value: { ready: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  );
  const { port } = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${String(port)}/`);
}

async function helperPidFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "omnileaf-webdriver-process-"));
  const file = join(folder, "helper.pid");
  onTestFinished(async () => {
    const pid = Number(await readFile(file, "utf8").catch(() => "0"));
    if (pid > 0 && isRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }
    await rm(folder, { recursive: true, force: true });
  });
  return file;
}

function helperPid(file: string): Promise<number> {
  return pollUntil(
    () => readFile(file, "utf8").then(Number, () => undefined),
    HELPER_START_TIMEOUT_MS,
    "the server's helper",
  );
}

test("stops the processes the server started on its own when it stops the server", async () => {
  const pidFile = await helperPidFile();
  const server = await startWebDriverProcess({
    command: process.execPath,
    args: ["-e", SPAWNS_A_DETACHED_HELPER, pidFile],
    env: process.env,
    server: await readyServer(),
  });
  const helper = await helperPid(pidFile);

  await server.stop();

  expect(isRunning(helper)).toBe(false);
});

test("stops the server and what it started when the server is not ready in time", async () => {
  const pidFile = await helperPidFile();

  const start = startWebDriverProcess({
    command: process.execPath,
    args: ["-e", SPAWNS_A_DETACHED_HELPER, pidFile],
    env: process.env,
    server: UNREACHABLE_SERVER,
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
  });

  await expect(start).rejects.toThrow("was not ready within");
  expect(isRunning(await helperPid(pidFile))).toBe(false);
});
