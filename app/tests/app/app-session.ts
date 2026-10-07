import { afterAll, beforeAll, beforeEach, inject } from "vitest";

import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { type Locator, Session, xpath } from "./webdriver.ts";

const MAIN_NAVIGATION = "//nav[@aria-label='Main']";

export function mainNavigationLink(name: string): Locator {
  return xpath(`${MAIN_NAVIGATION}//a[normalize-space()='${name}']`);
}

const LIBRARY_LINK = mainNavigationLink("Library");
const LIBRARY_LINK_WHEN_CURRENT = xpath(
  `${LIBRARY_LINK.value}[@aria-current='page']`,
);

/** Opens the library page and waits until the navigation marks it current, so nothing found afterwards belongs to the page before. */
export async function openLibraryPage(session: Session): Promise<void> {
  await (await session.waitFor(LIBRARY_LINK)).click();
  await session.waitFor(LIBRARY_LINK_WHEN_CURRENT);
}

/** Opens one WebDriver session past the first launch for the calling spec file's tests, starts each of them on the library page, and ends it after them. */
export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(new URL(app.server), app.capabilities);
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
