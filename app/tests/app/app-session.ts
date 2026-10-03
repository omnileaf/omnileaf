import { afterAll, beforeAll, inject } from "vitest";

import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { Session, xpath } from "./webdriver.ts";

const LIBRARY_LINK = xpath("//nav//a[normalize-space()='Library']");
const LIBRARY_LINK_WHEN_CURRENT = xpath(
  "//nav//a[normalize-space()='Library'][@aria-current='page']",
);

/** Opens one WebDriver session on the app's library page, past the first launch, for the calling spec file's tests, and ends it after them. */
export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(new URL(app.server), app.capabilities);
    await finishFirstLaunchIfShown(session);
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
