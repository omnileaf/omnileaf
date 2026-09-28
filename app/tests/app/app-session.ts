import { afterAll, beforeAll, inject } from "vitest";

import { Session } from "./webdriver.ts";

/** Opens one WebDriver session on the app for the calling spec file's tests, and ends it after them. */
export function useAppSession(): () => Session {
  let session: Session | undefined;

  beforeAll(async () => {
    const app = inject("appUnderTest");
    session = await Session.start(new URL(app.server), app.capabilities);
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
