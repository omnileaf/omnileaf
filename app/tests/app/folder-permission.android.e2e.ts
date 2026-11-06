import { afterAll, beforeAll, expect, inject, test } from "vitest";

import { Session, xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const BACK_KEY = 4;
const RUNNING_IN_FOREGROUND = 4;
const PICKER_TIMEOUT_MS = 30_000;

const GET_STARTED = xpath("//button[normalize-space()='Get started']");
const WELCOME_CONTINUE = xpath(
  "//main//button[starts-with(normalize-space(), 'Continue')]",
);
const LINK_STEP = xpath(
  "//h1[normalize-space()='Already have comics or books?']",
);
const ADD_A_FOLDER = xpath("//main//button[normalize-space()='Add a folder']");
const WHY_SHEET = xpath("//*[@role='alertdialog']");
const NOT_NOW = xpath(
  "//*[@role='alertdialog']//button[normalize-space()='Not now']",
);
const CONTINUE = xpath(
  "//*[@role='alertdialog']//button[normalize-space()='Continue']",
);
const SKIP = xpath("//main//button[starts-with(normalize-space(), 'Skip')]");
const NEXT_STEP = xpath("//h1[normalize-space()='A few choices']");
const SHEET_CLOSED =
  "return document.querySelector('[role=alertdialog]') === null;";
const USE_THIS_FOLDER = xpath(
  "//*[@text='Use this folder' or @text='USE THIS FOLDER']",
);

let session: Session | undefined;

function appSession(): Session {
  if (session === undefined) {
    throw new Error("the WebDriver session did not start");
  }
  return session;
}

beforeAll(async () => {
  const app = inject("appUnderTest");
  session = await Session.start(new URL(app.server), app.capabilities);
  await (await appSession().waitFor(GET_STARTED)).click();
  await (await appSession().waitFor(WELCOME_CONTINUE)).click();
  await appSession().waitFor(LINK_STEP);
});

afterAll(async () => {
  await session?.end();
});

async function appState(): Promise<unknown> {
  return appSession().runMobileCommand("queryAppState", { appId: APP_ID });
}

test("says why before Android's folder picker and leaves the app working when declined", async () => {
  await (await appSession().waitFor(ADD_A_FOLDER)).click();
  await appSession().waitFor(WHY_SHEET);

  await (await appSession().waitFor(NOT_NOW)).click();

  await appSession().waitUntil(SHEET_CLOSED, "the why-sheet to close");
  expect(await appState()).toBe(RUNNING_IN_FOREGROUND);
  await (await appSession().waitFor(SKIP)).click();
  expect(await (await appSession().waitFor(NEXT_STEP)).text()).toBe(
    "A few choices",
  );
  await appSession().back();
  await appSession().waitFor(LINK_STEP);
});

test("opens Android's picker after Continue and returns to the step when the picker is backed out of", async () => {
  await (await appSession().waitFor(ADD_A_FOLDER)).click();
  await appSession().waitFor(WHY_SHEET);

  await (await appSession().waitFor(CONTINUE)).click();
  await appSession().inNativeContext(async () => {
    await appSession().waitFor(USE_THIS_FOLDER, PICKER_TIMEOUT_MS);
    await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
  });

  await appSession().waitUntil(SHEET_CLOSED, "the why-sheet to close");
  await expect.poll(appState).toBe(RUNNING_IN_FOREGROUND);
  await appSession().waitFor(ADD_A_FOLDER);
});
