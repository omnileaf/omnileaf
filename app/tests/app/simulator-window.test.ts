import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, onTestFinished, test, vi } from "vitest";

import {
  followSimulatorWindow,
  selectedXcode,
  simulatorWindowApp,
  type Xcode,
} from "./simulator-window.ts";

const IS_MACOS = process.platform === "darwin";
const CAPABILITIES = { platformName: "iOS", "appium:noReset": true };
const DEVICE_HUB =
  "Contents/Applications/DeviceHub.app/Contents/MacOS/DeviceHub";
const SIMULATOR_APP =
  "Contents/Developer/Applications/Simulator.app/Contents/MacOS/Simulator";

function uniqueXcodeApp(name: string): string {
  return join("/", `omnileaf-test-${randomUUID()}`, `${name}.app`);
}

function xcodeAt(app: string, majorVersion: number): Xcode {
  return { developerDir: join(app, "Contents/Developer"), majorVersion };
}

async function runProcessAt(executable: string): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--eval", "setInterval(() => {}, 1000)", executable],
    { stdio: "ignore" },
  );
  onTestFinished(() => {
    child.kill();
  });
  await once(child, "spawn");
}

async function installXcode(version: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "omnileaf-xcode-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const contents = join(root, "Xcode.app", "Contents");
  await mkdir(join(contents, "Developer"), { recursive: true });
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`,
  );
  return join(contents, "Developer");
}

test("keeps the Simulator visible while the selected Xcode 27's device hub runs", async () => {
  const app = uniqueXcodeApp("Xcode");
  await runProcessAt(join(app, DEVICE_HUB));

  const capabilities = await followSimulatorWindow(
    CAPABILITIES,
    simulatorWindowApp(xcodeAt(app, 27)),
  );

  expect(capabilities).toEqual({ ...CAPABILITIES, "appium:isHeadless": false });
});

test("keeps the Simulator visible while the selected Xcode 26's Simulator app runs", async () => {
  const app = uniqueXcodeApp("Xcode");
  await runProcessAt(join(app, SIMULATOR_APP));

  const capabilities = await followSimulatorWindow(
    CAPABILITIES,
    simulatorWindowApp(xcodeAt(app, 26)),
  );

  expect(capabilities).toEqual({ ...CAPABILITIES, "appium:isHeadless": false });
});

test("keeps the Simulator headless while only an Xcode that is not selected shows its window", async () => {
  const selected = uniqueXcodeApp("Xcode");
  await runProcessAt(join(uniqueXcodeApp("Xcode-26"), SIMULATOR_APP));

  const capabilities = await followSimulatorWindow(
    CAPABILITIES,
    simulatorWindowApp(xcodeAt(selected, 27)),
  );

  expect(capabilities).toEqual({ ...CAPABILITIES, "appium:isHeadless": true });
});

test("keeps the Simulator headless while no window is open", async () => {
  const capabilities = await followSimulatorWindow(
    CAPABILITIES,
    simulatorWindowApp(xcodeAt(uniqueXcodeApp("Xcode"), 27)),
  );

  expect(capabilities).toEqual({ ...CAPABILITIES, "appium:isHeadless": true });
});

test.runIf(IS_MACOS)(
  "selects the Xcode that DEVELOPER_DIR names, as Appium does",
  async () => {
    const developerDir = await installXcode("27.1");
    vi.stubEnv("DEVELOPER_DIR", developerDir);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const xcode = await selectedXcode();

    expect(xcode).toEqual({ developerDir, majorVersion: 27 });
  },
);

test("finds the window app of a relative DEVELOPER_DIR from the working directory, as Appium does", () => {
  const xcode = xcodeAt("Xcode.app", 26);

  const windowApp = simulatorWindowApp(xcode);

  expect(windowApp).toBe(
    resolve("Xcode.app/Contents/Developer/Applications/Simulator.app"),
  );
});
