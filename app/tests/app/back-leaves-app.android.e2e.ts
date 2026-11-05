import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const BACK_KEY = 4;
const RUNNING_IN_FOREGROUND = 4;
const LIBRARY_HEADING = xpath("//main//h1[normalize-space()='Library']");

const appSession = useAppSession();

async function appState(): Promise<unknown> {
  return appSession().runMobileCommand("queryAppState", { appId: APP_ID });
}

test("leaves the app from Library", async () => {
  await appSession().waitFor(LIBRARY_HEADING);

  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });

  await expect.poll(appState).not.toBe(RUNNING_IN_FOREGROUND);
});
