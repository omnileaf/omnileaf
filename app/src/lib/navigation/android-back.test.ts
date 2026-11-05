import { expect, test } from "vitest";

import type { NavigationType } from "$app/navigation";
import type { Platform } from "#lib/ipc/bindings.ts";

import { BackDepth, followHistoryForBack } from "./android-back";

const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];

function navigations() {
  const listeners: ((arrival: { type: NavigationType }) => void)[] = [];
  return {
    afterEach: (listener: (arrival: { type: NavigationType }) => void) => {
      listeners.push(listener);
    },
    arrive: (type: NavigationType) => {
      for (const listener of listeners) {
        listener({ type });
      }
    },
  };
}

test("has nowhere to go back to on the screen the app opened on", () => {
  const depth = new BackDepth();

  depth.arrived("enter");

  expect(depth.canGoBack).toBe(false);
});

test("has somewhere to go back to once another screen is opened", () => {
  const depth = new BackDepth();

  depth.arrived("enter");
  depth.arrived("link");

  expect(depth.canGoBack).toBe(true);
});

test("has nowhere to go back to once every screen pushed is left again", () => {
  const depth = new BackDepth();

  depth.arrived("enter");
  depth.arrived("link");
  depth.arrived("goto");
  depth.arrived("popstate");
  depth.arrived("popstate");

  expect(depth.canGoBack).toBe(false);
});

test("counts a form's screen and the browser's back step", () => {
  const depth = new BackDepth();

  depth.arrived("enter");
  depth.arrived("form");

  expect(depth.canGoBack).toBe(true);

  depth.arrived("popstate");

  expect(depth.canGoBack).toBe(false);
});

test("tells Android after every navigation whether the page can go back", () => {
  const { afterEach, arrive } = navigations();
  const told: boolean[] = [];
  followHistoryForBack(
    () => "android",
    afterEach,
    (canGoBack) => {
      told.push(canGoBack);
      return Promise.resolve(null);
    },
  );

  arrive("enter");
  arrive("link");
  arrive("popstate");

  expect(told).toEqual([false, true, false]);
});

test.each(ELSEWHERE)("leaves the back gesture alone on %s", (platform) => {
  const { afterEach, arrive } = navigations();
  let told = 0;
  followHistoryForBack(
    () => platform,
    afterEach,
    () => {
      told += 1;
      return Promise.resolve(null);
    },
  );

  arrive("link");

  expect(told).toBe(0);
});

test("keeps back with the page while a sheet holds a history entry of its own", () => {
  const depth = new BackDepth();

  depth.overlayHeld();

  expect(depth.canGoBack).toBe(true);

  depth.overlayReleased();

  expect(depth.canGoBack).toBe(false);
});

test("leaves back with the page after a sheet closes over another screen", () => {
  const depth = new BackDepth();
  depth.arrived("enter");
  depth.arrived("link");
  depth.overlayHeld();

  depth.overlayReleased();

  expect(depth.canGoBack).toBe(true);

  depth.arrived("popstate");

  expect(depth.canGoBack).toBe(false);
});
