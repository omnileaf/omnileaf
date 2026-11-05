import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { BackDepth, followHistoryForBack } from "./android-back";

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

test("has nowhere to go back to on the screen the app opened on", () => {
  expect(new BackDepth().canGoBack).toBe(false);
});

test("has somewhere to go back to once the page pushes an entry", () => {
  const depth = new BackDepth();

  depth.pushed();

  expect(depth.canGoBack).toBe(true);
});

test("has nowhere to go back to once every entry pushed is stepped back over", () => {
  const depth = new BackDepth();

  depth.pushed();
  depth.pushed();
  depth.popped();
  depth.popped();
  depth.popped();

  expect(depth.canGoBack).toBe(false);
});

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
