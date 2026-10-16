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
const LIBRARY_SETTINGS_LINK = xpath("//main//a[@href='/settings/library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
export const FINISHED_SCAN_REPORT = xpath(
  "//li[@data-sonner-toast]//p[starts-with(normalize-space(), 'Added ')]",
);
const ON_LIBRARY_PAGE = "return location.pathname === '/';";

export async function openLibraryPage(session: Session): Promise<void> {
  await (await session.waitFor(LIBRARY_LINK)).click();
  await session.waitUntil(ON_LIBRARY_PAGE, "the library page");
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
