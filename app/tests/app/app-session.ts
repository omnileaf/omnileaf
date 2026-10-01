import { afterAll, beforeAll, inject } from "vitest";

import { Session, xpath } from "./webdriver.ts";

const LIBRARY_LINK = xpath("//nav//a[normalize-space()='Library']");

/** Opens one WebDriver session on the app's library page for the calling spec file's tests, and ends it after them. */
export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(new URL(app.server), app.capabilities);
    await (await session.waitFor(LIBRARY_LINK)).click();
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
