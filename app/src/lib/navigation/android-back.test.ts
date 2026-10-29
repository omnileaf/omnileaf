import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { followHistoryForBack } from "./android-back";

const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];

function navigations() {
  const listeners: (() => void)[] = [];
  return {
    afterEach: (listener: () => void) => {
      listeners.push(listener);
    },
    navigate: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

test("tells Android after every navigation, so its back gesture follows the page's history", () => {
  const { afterEach, navigate } = navigations();
  let told = 0;
  followHistoryForBack(
    () => "android",
    afterEach,
    () => {
      told += 1;
      return Promise.resolve(null);
    },
  );

  navigate();
  navigate();

  expect(told).toBe(2);
});

test.each(ELSEWHERE)("leaves the back gesture alone on %s", (platform) => {
  const { afterEach, navigate } = navigations();
  let told = 0;
  followHistoryForBack(
    () => platform,
    afterEach,
    () => {
      told += 1;
      return Promise.resolve(null);
    },
  );

  navigate();

  expect(told).toBe(0);
});
