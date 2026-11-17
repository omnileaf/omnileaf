import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { load } from "./+layout";
import {
  ASK_FOR_THE_SAVED_PAGE,
  LIBRARY,
  OPENABLE_LIBRARY,
  openingAt,
  SAVED_PAGE,
  serveAndroidRebuiltOn,
} from "./layout-fixture";

const FIRST_LAUNCH = "/first-launch";
const HISTORY = "/history";

afterEach(() => {
  clearMocks();
});

test("doesn't ask Android for the saved page when the library has a problem", async () => {
  const asked = serveAndroidRebuiltOn(SAVED_PAGE, {
    ...OPENABLE_LIBRARY,
    libraryProblem: "couldNotOpen",
  });

  await load(openingAt(LIBRARY));

  expect(asked).not.toContain(ASK_FOR_THE_SAVED_PAGE);
});

test("doesn't ask Android for the saved page on the first launch page", async () => {
  const asked = serveAndroidRebuiltOn(SAVED_PAGE, {
    ...OPENABLE_LIBRARY,
    isFirstLaunchFinished: false,
  });

  await load(openingAt(FIRST_LAUNCH));

  expect(asked).not.toContain(ASK_FOR_THE_SAVED_PAGE);
});

test("doesn't ask Android for the saved page on a page past the library", async () => {
  const asked = serveAndroidRebuiltOn(SAVED_PAGE, OPENABLE_LIBRARY);

  await load(openingAt(HISTORY));

  expect(asked).not.toContain(ASK_FOR_THE_SAVED_PAGE);
});

test("opens first launch instead of the page Android saved", async () => {
  serveAndroidRebuiltOn(SAVED_PAGE, {
    ...OPENABLE_LIBRARY,
    isFirstLaunchFinished: false,
  });

  const loading = load(openingAt(LIBRARY));

  await expect(loading).rejects.toMatchObject({
    status: 307,
    location: FIRST_LAUNCH,
  });
});
