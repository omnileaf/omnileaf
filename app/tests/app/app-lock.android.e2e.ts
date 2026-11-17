import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, expect, test } from "vitest";

import type { LockAfter } from "../../src/lib/ipc/bindings.ts";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { followRestartedApp } from "./restarted-app.ts";
import { xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const LOCK_CHOICES = "shared_prefs/app_lock.xml";
const ADB_TIMEOUT_MS = 30_000;
const READ_LOCK_AFTER = `return window.__TAURI_INTERNALS__.invoke("app_lock").then((lock) => lock.lockAfter);`;
const PRIVACY_LINK = xpath("//main//a[@href='/settings/privacy']");
const APP_LOCK_LINK = xpath("//main//a[@href='/settings/privacy/app-lock']");
const APP_LOCK_NOTE = xpath(
  "//main//p[starts-with(normalize-space(), 'Omnileaf asks for your fingerprint')]",
);
const LOCK_SWITCH = xpath(
  "//main//*[@role='switch'][normalize-space()='Lock Omnileaf']",
);
const COUNT_TIMES = `return document.querySelectorAll("main [role='radiogroup']").length;`;

const run = promisify(execFile);

const appSession = useAppSession();

async function asTheApp(command: string): Promise<void> {
  await run("adb", ["shell", "run-as", APP_ID, "sh", "-c", `'${command}'`], {
    timeout: ADB_TIMEOUT_MS,
  });
}

async function stopTheApp(): Promise<void> {
  await run("adb", ["shell", "am", "force-stop", APP_ID], {
    timeout: ADB_TIMEOUT_MS,
  });
}

function storedLockAfter(id: string): string {
  return `<map><boolean name="is_on" value="false" /><string name="lock_after">${id}</string></map>`;
}

async function storeLockAfter(id: string): Promise<void> {
  const encoded = Buffer.from(storedLockAfter(id)).toString("base64");
  await asTheApp(
    `mkdir -p shared_prefs && echo ${encoded} | base64 -d > ${LOCK_CHOICES}`,
  );
}

async function reopenWithLockAfter(id: string): Promise<void> {
  await stopTheApp();
  await storeLockAfter(id);
  await appSession().runMobileCommand("activateApp", { appId: APP_ID });
  await followRestartedApp(appSession());
  await openLibraryPage(appSession());
}

afterAll(async () => {
  await stopTheApp();
  await asTheApp(`rm -f ${LOCK_CHOICES}`);
});

test.each<{ readonly stored: string; readonly read: LockAfter }>([
  { stored: "fifteenMinutes", read: "fiveMinutes" },
  { stored: "oneHour", read: "thirtyMinutes" },
])(
  "reads a stored $stored as $read, so the lock never waits longer than chosen",
  async ({ stored, read }) => {
    await reopenWithLockAfter(stored);

    const lockAfter = await appSession().run(READ_LOCK_AFTER);

    expect(lockAfter).toBe(read);
  },
);

test("opens App lock with only the note and the switch while the lock is off", async () => {
  await reopenWithLockAfter("fiveMinutes");

  await (await appSession().waitFor(mainNavigationLink("Settings"))).click();
  await (await appSession().waitFor(PRIVACY_LINK)).click();
  await (await appSession().waitFor(APP_LOCK_LINK)).click();
  const note = await appSession().waitFor(APP_LOCK_NOTE);
  await appSession().waitFor(LOCK_SWITCH);

  expect(await note.text()).toContain(
    "Downloads and sync carry on while it’s locked",
  );
  expect(await appSession().run(COUNT_TIMES)).toBe(0);
  expect(await appSession().run(READ_LOCK_AFTER)).toBe("fiveMinutes");
});
