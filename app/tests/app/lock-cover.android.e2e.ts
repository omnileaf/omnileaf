import { afterAll, beforeAll, onTestFinished, test } from "vitest";

import {
  ANDROID_APP_ID,
  adbShell,
  androidSetting,
} from "./android-settings.ts";
import {
  clickWhenShown,
  expectStillOn,
  mainNavigationLink,
  settingsRow,
  shownPage,
  useAppSession,
} from "./app-session.ts";
import { pollUntil, xpath } from "./webdriver.ts";

const PIN = "1234";
const HOME_KEY = 3;
const BACK_KEY = 4;
const DEFAULT_FONT_SCALE = "1.0";
const LARGER_FONT_SCALE = "1.3";
const PROMPT_TIMEOUT_MS = 15_000;
const REDRAW_TIMEOUT_MS = 15_000;
const LOCK_SCREEN_OFF = "true";
const SCREEN_LOCK_PROMPT = /mCurrentFocus=.*BiometricPrompt/;
const STOPPED_APP = /mResumed=false mStopped=true/;
const PIN_ENTRY = xpath(
  "//*[@resource-id='com.android.systemui:id/lockPassword' or @resource-id='com.android.systemui:id/key_enter']",
);
const LOCK_SWITCH_LABEL = "Lock Omnileaf";
const LOCK_SWITCH = xpath(
  `//main//*[@role='switch'][starts-with(normalize-space(), '${LOCK_SWITCH_LABEL}')]`,
);
const LOCK_AFTER = xpath(
  "//main//button[starts-with(normalize-space(), 'Lock after')]",
);
const IMMEDIATELY = xpath(
  "//*[@role='radio'][starts-with(normalize-space(), 'Immediately')]",
);
const UNLOCK_BUTTON = xpath("//android.widget.Button[@text='Unlock']");
const LOCKS_IMMEDIATELY = `return [...document.querySelectorAll("main button")].some((button) => button.textContent.startsWith("Lock after") && button.textContent.includes("Immediately"));`;
const IS_LOCK_ON = `return [...document.querySelectorAll("main [role=switch]")].some((lockSwitch) => lockSwitch.textContent.trim().startsWith("${LOCK_SWITCH_LABEL}") && lockSwitch.getAttribute("aria-checked") === "true");`;

const fontScale = androidSetting("system", "font_scale");

const appSession = useAppSession();

let fontScaleBefore: string | undefined;
let lockScreenBefore: string | undefined;
let isPinSet = false;

beforeAll(async () => {
  fontScaleBefore = await fontScale.read();
  lockScreenBefore = await adbShell("locksettings", "get-disabled");
  const answer = await adbShell("locksettings", "set-pin", PIN);
  if (!answer.startsWith("Pin set")) {
    throw new Error(`could not set a screen lock PIN: ${answer}`);
  }
  isPinSet = true;
});

afterAll(async () => {
  if (fontScaleBefore !== undefined) {
    await fontScale.restore(fontScaleBefore);
  }
});

afterAll(async () => {
  if (!isPinSet) {
    return;
  }
  await adbShell("locksettings", "clear", "--old", PIN);
  if (lockScreenBefore === LOCK_SCREEN_OFF) {
    await adbShell("locksettings", "set-disabled", "true");
  }
});

async function isScreenLockAsking(): Promise<true | undefined> {
  const windows = await adbShell("dumpsys", "window");
  return SCREEN_LOCK_PROMPT.test(windows) ? true : undefined;
}

async function answerScreenLock(): Promise<void> {
  await appSession().inNativeContext(() =>
    appSession().waitFor(PIN_ENTRY, PROMPT_TIMEOUT_MS),
  );
  await adbShell("input", "text", PIN);
  await adbShell("input", "keyevent", "ENTER");
}

async function pressKey(keycode: number): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode });
}

async function openAppLockSettings(): Promise<void> {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Privacy and security"));
  await clickWhenShown(appSession(), settingsRow("App lock"));
  await shownPage(appSession(), "App lock");
}

async function lockImmediately(): Promise<void> {
  await turnLockOff();
  await clickWhenShown(appSession(), LOCK_SWITCH);
  await answerScreenLock();
  await appSession().waitUntil(IS_LOCK_ON, "app lock to turn on");
  await clickWhenShown(appSession(), LOCK_AFTER);
  await clickWhenShown(appSession(), IMMEDIATELY);
  await appSession().waitUntil(
    LOCKS_IMMEDIATELY,
    "the lock set to Immediately",
  );
}

async function turnLockOff(): Promise<void> {
  if ((await appSession().run(IS_LOCK_ON)) === true) {
    await clickWhenShown(appSession(), LOCK_SWITCH);
  }
}

async function isAppStopped(): Promise<true | undefined> {
  const activities = await adbShell("dumpsys", "activity", ANDROID_APP_ID);
  return STOPPED_APP.test(activities) ? true : undefined;
}

async function leaveAndComeBack(): Promise<void> {
  await pressKey(HOME_KEY);
  await pollUntil(isAppStopped, PROMPT_TIMEOUT_MS, "Android to stop the app");
  await adbShell("am", "start", "-n", `${ANDROID_APP_ID}/.MainActivity`);
  await pollUntil(
    isScreenLockAsking,
    PROMPT_TIMEOUT_MS,
    "the lock to ask on coming back",
  );
  await pressKey(BACK_KEY);
}

async function unlockIfCovered(): Promise<void> {
  const unlock = await appSession().inNativeContext(async () => {
    const button = await appSession().findWithin(UNLOCK_BUTTON, 0);
    await button?.click();
    return button;
  });
  if (unlock !== undefined) {
    await answerScreenLock();
  }
}

async function unlockAndTurnLockOff(): Promise<void> {
  await unlockIfCovered();
  await turnLockOff();
}

async function unlockButtonWidth(): Promise<number> {
  const { width } = await appSession().inNativeContext(async () =>
    (await appSession().waitFor(UNLOCK_BUTTON)).size(),
  );
  return width;
}

test("redraws the lock cover for a larger font size without leaving the page", async () => {
  await fontScale.put(DEFAULT_FONT_SCALE);
  await openAppLockSettings();
  await lockImmediately();
  onTestFinished(unlockAndTurnLockOff);
  const windowsBefore = await appSession().windows();
  await leaveAndComeBack();
  const widthBefore = await unlockButtonWidth();

  await fontScale.put(LARGER_FONT_SCALE);

  await pollUntil(
    async () => ((await unlockButtonWidth()) > widthBefore ? true : undefined),
    REDRAW_TIMEOUT_MS,
    "the lock cover redrawn for the larger font size",
  );
  await unlockIfCovered();
  await expectStillOn(appSession(), windowsBefore, "App lock");
});
