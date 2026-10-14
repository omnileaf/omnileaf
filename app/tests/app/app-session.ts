import { afterAll, beforeAll, beforeEach, inject } from "vitest";

import type { AppUnderTest } from "./app-under-test.ts";
import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { followSimulatorWindow } from "./simulator-window.ts";
import {
  type Capabilities,
  type Locator,
  Session,
  xpath,
} from "./webdriver.ts";

const MAIN_NAVIGATION = "//nav[@aria-label='Main']";

export function mainNavigationLink(name: string): Locator {
  return xpath(`${MAIN_NAVIGATION}//a[normalize-space()='${name}']`);
}

const LIBRARY_LINK = mainNavigationLink("Library");
const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[normalize-space()='Library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FINISHED_SCAN_REPORT = xpath(
  "//*[@role='status'][starts-with(normalize-space(), 'Found ')]",
);
const LIBRARY_LINK_WHEN_CURRENT = xpath(
  `${LIBRARY_LINK.value}[@aria-current='page']`,
);

export async function openLibraryPage(session: Session): Promise<void> {
  await (await session.waitFor(LIBRARY_LINK)).click();
  await session.waitFor(LIBRARY_LINK_WHEN_CURRENT);
}

async function sessionCapabilities(app: AppUnderTest): Promise<Capabilities> {
  if (app.simulatorWindowApp === undefined) {
    return app.capabilities;
  }
  return followSimulatorWindow(app.capabilities, app.simulatorWindowApp);
}

/** Adds the folder the app picks from Settings › Library, where Add a folder stays once the library has books, and returns to the library page once its scan reports. */
export async function addSampleLibrary(session: Session): Promise<void> {
  await openLibraryPage(session);
  await (await session.waitFor(SETTINGS_LINK)).click();
  await (await session.waitFor(LIBRARY_SETTINGS_LINK)).click();
  await (await session.waitFor(ADD_FOLDER_BUTTON)).click();
  await session.waitFor(FINISHED_SCAN_REPORT);
  await openLibraryPage(session);
}

/** Shares one WebDriver session, past the first launch, across the calling spec file and starts each test on the library page. */
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
