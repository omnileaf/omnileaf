import { afterEach, expect, test } from "vitest";

import type { InterfaceError } from "#lib/ipc/bindings.ts";

import {
  announceInterfaceError,
  describeInterfaceError,
  listenForInterfaceErrors,
} from "./interface-errors";

const stops: (() => void)[] = [];

function listen(): InterfaceError[] {
  const heard: InterfaceError[] = [];
  stops.push(
    listenForInterfaceErrors(window, (error) => {
      heard.push(error);
    }),
  );
  return heard;
}

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

test("describes an error by its kind, message and stack", () => {
  const error = new TypeError("page is undefined");

  const described = describeInterfaceError(error);

  expect(described).toEqual({
    message: "TypeError: page is undefined",
    stack: error.stack ?? null,
  });
});

test("describes anything else thrown by its text", () => {
  const described = describeInterfaceError(42);

  expect(described).toEqual({ message: "42", stack: null });
});

test("hears an error nothing caught", () => {
  const heard = listen();

  window.dispatchEvent(
    new ErrorEvent("error", { error: new RangeError("too far"), message: "" }),
  );

  expect(heard.map((error) => error.message)).toEqual(["RangeError: too far"]);
});

test("hears a promise nothing handled", () => {
  const heard = listen();

  window.dispatchEvent(
    new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason: new Error("lost"),
    }),
  );

  expect(heard.map((error) => error.message)).toEqual(["Error: lost"]);
});

test("hears an error the framework caught and passed on", () => {
  const heard = listen();

  announceInterfaceError(window, new Error("load failed"));

  expect(heard.map((error) => error.message)).toEqual(["Error: load failed"]);
});

test("stops listening when asked", () => {
  const heard = listen();
  stops.splice(0).forEach((stop) => {
    stop();
  });

  announceInterfaceError(window, new Error("ignored"));

  expect(heard).toEqual([]);
});
