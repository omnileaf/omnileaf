import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, test } from "vitest";

import { openSettingsPage, useAppSession } from "./app-session.ts";
import { capability } from "./app-under-test.ts";
import { openFromTheLauncher } from "./icon-action-intent.ts";
import { followRestartedApp } from "./restarted-app.ts";
import { savedOnThePhone } from "./saved-local-storage.ts";
import { segmentedOption } from "./segmented-control.ts";
import { pollUntil } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const ADB_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 180_000;
const UPDATE_TEST_TIMEOUT_MS = 300_000;
const ADB_OUTPUT_MAX_BYTES = 16 * 1024 * 1024;
const NIGHT_MODE_ANSWER = "Night mode: ";
const PHONE_NIGHT_MODES = ["yes", "no", "auto"] as const;
const NIGHT_QUALIFIER = /\snight\s/;
const APP_PROCESS_RECORD = `:${APP_ID}/u`;
const PROCESS_RECORD_SEPARATOR = "*APP*";
const CONFIGURATION_LINE = "Configuration={";
const THEME_KEY = "omnileaf.theme";

const PREFERS_LIGHT =
  "return matchMedia('(prefers-color-scheme: light)').matches;";

type PhoneNightMode = (typeof PHONE_NIGHT_MODES)[number];
type AppNightMode = "night" | "notnight";

const run = promisify(execFile);

const appSession = useAppSession();

let phoneNightModeBefore: PhoneNightMode | undefined;

async function adb(
  args: readonly string[],
  timeout = ADB_TIMEOUT_MS,
): Promise<string> {
  const { stdout } = await run("adb", args, {
    timeout,
    maxBuffer: ADB_OUTPUT_MAX_BYTES,
  });
  return stdout;
}

async function phoneNightMode(): Promise<PhoneNightMode> {
  const answer = (await adb(["shell", "cmd", "uimode", "night"])).trim();
  const mode = PHONE_NIGHT_MODES.find(
    (candidate) => answer === `${NIGHT_MODE_ANSWER}${candidate}`,
  );
  if (mode === undefined) {
    throw new Error(`cmd uimode answered "${answer}"`);
  }
  return mode;
}

async function setPhoneNightMode(mode: PhoneNightMode): Promise<void> {
  await adb(["shell", "cmd", "uimode", "night", mode]);
}

async function restorePhoneNightMode(): Promise<void> {
  if (phoneNightModeBefore !== undefined) {
    await setPhoneNightMode(phoneNightModeBefore);
  }
}

async function chooseTheme(label: string): Promise<void> {
  await openSettingsPage(appSession(), "Appearance");
  await (await appSession().waitFor(segmentedOption("//main", label))).click();
}

async function savedTheme(): Promise<string | undefined> {
  return savedOnThePhone(THEME_KEY);
}

/** Chromium writes localStorage to disk a few seconds after the page sets it, so an update that kills the app sooner loses the choice. */
async function waitForSavedTheme(theme: string): Promise<void> {
  await pollUntil(
    async () => ((await savedTheme()) === theme ? true : undefined),
    ADB_TIMEOUT_MS,
    `the ${theme} theme to be saved on the phone`,
  );
}

async function updateTheApp(): Promise<void> {
  await adb(["install", "-r", capability("appium:app")], INSTALL_TIMEOUT_MS);
}

async function appNightMode(): Promise<AppNightMode> {
  const processes = await adb([
    "shell",
    "dumpsys",
    "activity",
    "processes",
    APP_ID,
  ]);
  const configuration = processes
    .split(PROCESS_RECORD_SEPARATOR)
    .find((record) => record.includes(APP_PROCESS_RECORD))
    ?.split("\n")
    .find((line) => line.trim().startsWith(CONFIGURATION_LINE));
  if (configuration === undefined) {
    throw new Error("dumpsys showed no configuration for the app's process");
  }
  return NIGHT_QUALIFIER.test(configuration) ? "night" : "notnight";
}

async function waitForAppNightMode(mode: AppNightMode): Promise<void> {
  await pollUntil(
    async () => ((await appNightMode()) === mode ? true : undefined),
    ADB_TIMEOUT_MS,
    `the app's own night mode to be ${mode}`,
  );
}

beforeAll(async () => {
  phoneNightModeBefore = await phoneNightMode();
  await setPhoneNightMode("yes");
});

afterAll(async () => {
  const steps = [restorePhoneNightMode, () => chooseTheme("System")];
  const failures: unknown[] = [];
  for (const step of steps) {
    await step().catch((error: unknown) => {
      failures.push(error);
    });
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "put the phone and app back after the spec",
    );
  }
});

test(
  "starts in the Light theme on a dark phone after the app is updated",
  { timeout: UPDATE_TEST_TIMEOUT_MS },
  async () => {
    await chooseTheme("Light");
    await waitForAppNightMode("notnight");
    await waitForSavedTheme("light");

    await updateTheApp();
    await openFromTheLauncher();
    await followRestartedApp(appSession());

    expect(await appNightMode()).toBe("notnight");
    expect(await appSession().run(PREFERS_LIGHT)).toBe(true);
  },
);
