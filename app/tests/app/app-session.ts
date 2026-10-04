import { afterAll, beforeAll, inject } from "vitest";

import { type Locator, Session, xpath } from "./webdriver.ts";

const MAIN_NAVIGATION = "//nav[@aria-label='Main']";

export function mainNavigationLink(name: string): Locator {
  return xpath(`${MAIN_NAVIGATION}//a[normalize-space()='${name}']`);
}

const LIBRARY_LINK = mainNavigationLink("Library");
const LIBRARY_LINK_WHEN_CURRENT = xpath(
  `${MAIN_NAVIGATION}//a[normalize-space()='Library'][@aria-current='page']`,
);

/** Opens one WebDriver session on the app's library page for the calling spec file's tests, and ends it after them. */
export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(new URL(app.server), app.capabilities);
    await (await session.waitFor(LIBRARY_LINK)).click();
    await session.waitFor(LIBRARY_LINK_WHEN_CURRENT);
  });

  afterAll(async () => {
    await session?.end();
  });

  return () => {
    if (session === undefined) {
      throw new Error("the WebDriver session did not start");
    }
    return session;
  };
}
