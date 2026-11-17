import { afterAll, beforeAll, test } from "vitest";

import { androidSetting } from "./android-settings.ts";
import {
  clickWhenShown,
  expectStillOn,
  mainNavigationLink,
  settingsRow,
  shownPage,
  useAppSession,
} from "./app-session.ts";

const BOLD_TEXT_ADJUSTMENT = "300";
const NO_ADJUSTMENT = "0";
const IS_BOLD = "return document.documentElement.dataset.boldText === ''";
const IS_PLAIN =
  "return document.documentElement.dataset.boldText === undefined";

const fontWeightAdjustment = androidSetting("secure", "font_weight_adjustment");

const appSession = useAppSession();

let adjustmentBefore: string | undefined;

beforeAll(async () => {
  adjustmentBefore = await fontWeightAdjustment.read();
});

afterAll(async () => {
  if (adjustmentBefore !== undefined) {
    await fontWeightAdjustment.restore(adjustmentBefore);
  }
});

test("bolds the open page in place when Android's Bold text turns on", async () => {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Accessibility"));
  await shownPage(appSession(), "Accessibility");
  await fontWeightAdjustment.put(NO_ADJUSTMENT);
  await appSession().waitUntil(IS_PLAIN, "the page to start plain");
  const windowsBefore = await appSession().windows();

  await fontWeightAdjustment.put(BOLD_TEXT_ADJUSTMENT);
  await appSession().waitUntil(IS_BOLD, "the page to turn bold");

  await expectStillOn(appSession(), windowsBefore, "Accessibility");
});
