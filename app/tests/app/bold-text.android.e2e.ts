import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, test } from "vitest";

import {
  clickWhenShown,
  mainNavigationLink,
  settingsRow,
  shownPage,
  useAppSession,
} from "./app-session.ts";

const ADB_TIMEOUT_MS = 30_000;
const FONT_WEIGHT_ADJUSTMENT = "font_weight_adjustment";
const UNSET_SETTING = "null";
const BOLD_TEXT_ADJUSTMENT = "300";
const NO_ADJUSTMENT = "0";
const IS_BOLD = "return document.documentElement.dataset.boldText === ''";
const IS_PLAIN =
  "return document.documentElement.dataset.boldText === undefined";

const run = promisify(execFile);

const appSession = useAppSession();

let adjustmentBefore: string | undefined;

beforeAll(async () => {
  adjustmentBefore = await fontWeightAdjustment();
});

afterAll(async () => {
  if (adjustmentBefore !== undefined) {
    await restoreFontWeightAdjustment(adjustmentBefore);
  }
});

async function secureSetting(
  verb: "get" | "put" | "delete",
  ...args: readonly string[]
): Promise<string> {
  const { stdout } = await run(
    "adb",
    ["shell", "settings", verb, "secure", ...args],
    { timeout: ADB_TIMEOUT_MS },
  );
  return stdout.trim();
}

function fontWeightAdjustment(): Promise<string> {
  return secureSetting("get", FONT_WEIGHT_ADJUSTMENT);
}

async function setFontWeightAdjustment(adjustment: string): Promise<void> {
  await secureSetting("put", FONT_WEIGHT_ADJUSTMENT, adjustment);
}

async function restoreFontWeightAdjustment(adjustment: string): Promise<void> {
  if (adjustment === UNSET_SETTING) {
    await secureSetting("delete", FONT_WEIGHT_ADJUSTMENT);
    return;
  }
  await setFontWeightAdjustment(adjustment);
}

test("bolds the open page in place when Android's Bold text turns on", async () => {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Accessibility"));
  await shownPage(appSession(), "Accessibility");
  await setFontWeightAdjustment(NO_ADJUSTMENT);
  await appSession().waitUntil(IS_PLAIN, "the page to start plain");
  const windowsBefore = await appSession().windows();

  await setFontWeightAdjustment(BOLD_TEXT_ADJUSTMENT);
  await appSession().waitUntil(IS_BOLD, "the page to turn bold");

  expect(await appSession().windows()).toEqual(windowsBefore);
  expect(await shownPage(appSession(), "Accessibility")).toBe("Accessibility");
});
