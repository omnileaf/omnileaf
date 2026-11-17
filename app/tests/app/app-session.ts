import { afterAll, beforeAll, beforeEach, expect, inject } from "vitest";

import type { AppUnderTest } from "./app-under-test.ts";
import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { followSimulatorWindow } from "./simulator-window.ts";
import {
  type Capabilities,
  ELEMENT_TIMEOUT_MS,
  type Locator,
  pollUntil,
  Session,
  xpath,
} from "./webdriver.ts";

const MAIN_NAVIGATION = "//nav[@aria-label='Main']";

export function mainNavigationLink(name: string): Locator {
  return xpath(`${MAIN_NAVIGATION}//a[normalize-space()='${name}']`);
}

export function settingsRow(label: string): Locator {
  return xpath(
    `//main//a[not(ancestor::nav)][starts-with(normalize-space(), '${label}')]`,
  );
}

export async function clickWhenShown(
  session: Session,
  target: Locator,
): Promise<void> {
  await (await session.waitFor(target)).click();
}

export async function shownPage(
  session: Session,
  title: string,
): Promise<string> {
  const heading = await session.waitFor(
    xpath(`//main//h1[normalize-space()='${title}']`),
  );
  return heading.text();
}

export async function openSettingsPage(
  session: Session,
  row: string,
): Promise<void> {
  await clickWhenShown(session, SETTINGS_LINK);
  await clickWhenShown(session, settingsRow(row));
  await shownPage(session, row);
}

export async function expectStillOn(
  session: Session,
  windowsBefore: readonly string[],
  page: string,
): Promise<void> {
  expect(await session.windows()).toEqual(windowsBefore);
  expect(await shownPage(session, page)).toBe(page);
}

const LIBRARY_LINK = mainNavigationLink("Library");
const BACK_LINK = xpath("//a[@data-back-link]");
const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[@href='/settings/library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
export const FINISHED_SCAN_REPORT = xpath(
  "//*[@data-sonner-toast or @data-info-bar]//p[starts-with(normalize-space(), 'Added ')]",
);
const ON_LIBRARY_PAGE = "return location.pathname === '/';";
export const SHOWN_PATH = "return location.pathname;";

async function stepTowardsTheLibrary(
  session: Session,
): Promise<true | undefined> {
  if ((await session.run(ON_LIBRARY_PAGE)) === true) {
    return true;
  }
  const back = await session.findWithin(BACK_LINK, 0);
  if (back === undefined) {
    await (await session.waitFor(LIBRARY_LINK)).click();
  } else {
    await back.clickUnlessStale();
  }
  return undefined;
}

export async function openLibraryPage(session: Session): Promise<void> {
  await pollUntil(
    () => stepTowardsTheLibrary(session),
    ELEMENT_TIMEOUT_MS,
    "the library page",
  );
}

async function sessionCapabilities(app: AppUnderTest): Promise<Capabilities> {
  if (app.simulatorWindowApp === undefined) {
    return app.capabilities;
  }
  return followSimulatorWindow(app.capabilities, app.simulatorWindowApp);
}

export async function addSampleLibrary(session: Session): Promise<void> {
  await openLibraryPage(session);
  await (await session.waitFor(SETTINGS_LINK)).click();
  await (await session.waitFor(LIBRARY_SETTINGS_LINK)).click();
  await (await session.waitFor(ADD_FOLDER_BUTTON)).click();
  await session.waitFor(FINISHED_SCAN_REPORT);
  await openLibraryPage(session);
}

export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(
      new URL(app.server),
      await sessionCapabilities(app),
    );
    await finishFirstLaunchIfShown(session);
  });

  beforeEach(async () => {
    await openLibraryPage(appSession());
  });

  afterAll(async () => {
    await session?.end();
  });

  function appSession(): Session {
    if (session === undefined) {
      throw new Error("the WebDriver session did not start");
    }
    return session;
  }

  return appSession;
}
