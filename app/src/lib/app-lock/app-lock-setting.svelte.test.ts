import { expect, test, vi } from "vitest";

import type { AppLockTurning, IpcError } from "#lib/ipc/bindings.ts";

import { NEW_APP_LOCK } from "./app-lock.ts";
import {
  type AppLockChanges,
  AppLockSetting,
} from "./app-lock-setting.svelte.ts";

const NOT_CHANGED: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};

const done = () => Promise.resolve({ status: "ok", data: null } as const);
const failed = () =>
  Promise.resolve({ status: "error", error: NOT_CHANGED } as const);

function changes(overrides: Partial<AppLockChanges> = {}): AppLockChanges {
  return {
    turnOn: () => Promise.resolve({ status: "ok", data: "turnedOn" }),
    turnOff: done,
    chooseLockAfter: done,
    ...overrides,
  };
}

function answering(turning: AppLockTurning): Partial<AppLockChanges> {
  return { turnOn: () => Promise.resolve({ status: "ok", data: turning }) };
}

function answers() {
  return { onFailure: vi.fn(), onNoScreenLock: vi.fn() };
}

test("turns the lock on once the phone confirms it", async () => {
  const setting = new AppLockSetting(NEW_APP_LOCK, changes(), answers());

  await setting.turnOn("Turn on app lock");

  expect(setting.lock.isOn).toBe(true);
  expect(setting.isAsking).toBe(false);
});

test("leaves the lock off, saying nothing, when the check is cancelled", async () => {
  const told = answers();
  const setting = new AppLockSetting(
    NEW_APP_LOCK,
    changes(answering("notConfirmed")),
    told,
  );

  await setting.turnOn("Turn on app lock");

  expect(setting.lock.isOn).toBe(false);
  expect(told.onFailure).not.toHaveBeenCalled();
  expect(told.onNoScreenLock).not.toHaveBeenCalled();
});

test("asks for a screen lock first on a phone without one", async () => {
  const told = answers();
  const setting = new AppLockSetting(
    NEW_APP_LOCK,
    changes(answering("noScreenLock")),
    told,
  );

  await setting.turnOn("Turn on app lock");

  expect(setting.lock.isOn).toBe(false);
  expect(told.onNoScreenLock).toHaveBeenCalledOnce();
});

test("leaves the lock off and reports why when turning it on fails", async () => {
  const told = answers();
  const setting = new AppLockSetting(
    NEW_APP_LOCK,
    changes({
      turnOn: () => Promise.resolve({ status: "error", error: NOT_CHANGED }),
    }),
    told,
  );

  await setting.turnOn("Turn on app lock");

  expect(setting.lock.isOn).toBe(false);
  expect(setting.isAsking).toBe(false);
  expect(told.onFailure).toHaveBeenCalledWith(NOT_CHANGED);
});

test("stops asking even when turning the lock on throws", async () => {
  const setting = new AppLockSetting(
    NEW_APP_LOCK,
    changes({ turnOn: () => Promise.reject(new Error("the bridge closed")) }),
    answers(),
  );

  await expect(setting.turnOn("Turn on app lock")).rejects.toThrow();

  expect(setting.isAsking).toBe(false);
});

test("keeps the lock on and reports why when turning it off fails", async () => {
  const told = answers();
  const setting = new AppLockSetting(
    { ...NEW_APP_LOCK, isOn: true },
    changes({ turnOff: failed }),
    told,
  );

  await setting.turnOff();

  expect(setting.lock.isOn).toBe(true);
  expect(told.onFailure).toHaveBeenCalledWith(NOT_CHANGED);
});

test("keeps the delay chosen", async () => {
  const setting = new AppLockSetting(NEW_APP_LOCK, changes(), answers());

  await setting.chooseLockAfter("thirtyMinutes");

  expect(setting.lock.lockAfter).toBe("thirtyMinutes");
});

test("keeps the old delay when the new one can't be kept", async () => {
  const told = answers();
  const setting = new AppLockSetting(
    NEW_APP_LOCK,
    changes({ chooseLockAfter: failed }),
    told,
  );

  await setting.chooseLockAfter("thirtyMinutes");

  expect(setting.lock.lockAfter).toBe("oneMinute");
  expect(told.onFailure).toHaveBeenCalledWith(NOT_CHANGED);
});
