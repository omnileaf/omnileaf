import { expect, test, vi } from "vitest";

import {
  appLockSummary,
  NEW_APP_LOCK,
  readAppLock,
  rememberLockWords,
} from "./app-lock.ts";

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

test("hands Android the words its lock screen shows", async () => {
  const remember = vi.fn(() =>
    Promise.resolve({ status: "ok", data: null } as const),
  );

  await rememberLockWords("android", remember);

  expect(remember).toHaveBeenCalledWith({
    title: "Omnileaf is locked",
    body: "Unlock to open your library.",
    unlock: "Unlock",
    prompt: "Unlock Omnileaf",
  });
});

test("hands the lock screen's words to no other platform", async () => {
  const remember = vi.fn(() =>
    Promise.resolve({ status: "ok", data: null } as const),
  );

  await rememberLockWords("ios", remember);

  expect(remember).not.toHaveBeenCalled();
});
