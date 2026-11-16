import { afterEach, expect, test, vi } from "vitest";

import {
  appLockSummary,
  LOCK_DELAY_NAMES,
  LOCK_DELAYS,
  NEW_APP_LOCK,
  readAppLock,
  rememberLockWords,
} from "./app-lock.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

test("offers the four times to lock after, shortest first", () => {
  const names = LOCK_DELAYS.map((delay) => LOCK_DELAY_NAMES[delay]());

  expect(names).toEqual(["Immediately", "1 minute", "5 minutes", "30 minutes"]);
});

test("says the app lock is off", () => {
  expect(appLockSummary(NEW_APP_LOCK)).toBe("Off");
});

test("names what unlocks it and the delay once it is on", () => {
  const summary = appLockSummary({
    ...NEW_APP_LOCK,
    isOn: true,
    lockAfter: "fiveMinutes",
  });

  expect(summary).toBe("Fingerprint, face or screen lock · after 5 minutes");
});

test("says it locks immediately when there is no delay", () => {
  const summary = appLockSummary({
    ...NEW_APP_LOCK,
    isOn: true,
    lockAfter: "immediately",
  });

  expect(summary).toBe("Fingerprint, face or screen lock · immediately");
});

test("reads the app lock the phone keeps", async () => {
  const reading = await readAppLock(() =>
    Promise.resolve({ status: "ok", data: NEW_APP_LOCK }),
  );

  expect(reading).toEqual({ kind: "read", lock: NEW_APP_LOCK });
});

test("finds no app lock where it isn't offered", async () => {
  const reading = await readAppLock(() =>
    Promise.resolve({
      status: "error",
      error: {
        code: "appLockUnavailable",
        message: "the app lock isn't offered here",
      },
    }),
  );

  expect(reading).toEqual({ kind: "unavailable" });
});

test("tells a failed read apart from a missing app lock", async () => {
  const error = {
    code: "internal",
    message: "something went wrong inside the app",
  } as const;

  const reading = await readAppLock(() =>
    Promise.resolve({ status: "error", error }),
  );

  expect(reading).toEqual({ kind: "failed", error });
});

test("hands the lock screen its words", async () => {
  const remember = vi.fn(() =>
    Promise.resolve({ status: "ok", data: null } as const),
  );

  await rememberLockWords(remember);

  expect(remember).toHaveBeenCalledWith({
    title: "Omnileaf is locked",
    body: "Unlock to open your library.",
    unlock: "Unlock",
    prompt: "Unlock Omnileaf",
    turnedOff: "App lock was turned off because this phone has no screen lock.",
  });
});

test("reports nothing where no lock screen is offered", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);

  await rememberLockWords(() =>
    Promise.resolve({
      status: "error",
      error: {
        code: "appLockUnavailable",
        message: "the app lock isn't offered here",
      },
    }),
  );

  expect(reported).not.toHaveBeenCalled();
});

test("reports words the phone turns down", async () => {
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);
  const error = {
    code: "internal",
    message: "something went wrong inside the app",
  } as const;

  await rememberLockWords(() => Promise.resolve({ status: "error", error }));

  expect(reported).toHaveBeenCalledWith(error);
});
