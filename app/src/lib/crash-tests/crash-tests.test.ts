import { expect, test } from "vitest";

import type { IpcError } from "$lib/ipc/bindings";

import {
  type CrashTestBackend,
  CrashTestRefused,
  CrashTests,
  InterfaceErrorTest,
} from "./crash-tests";

type Outcome =
  { status: "ok"; data: null } | { status: "error"; error: IpcError };

const DONE: Outcome = { status: "ok", data: null };
const REFUSED: Outcome = {
  status: "error",
  error: {
    code: "developmentBuildOnly",
    message: "only development builds can crash on purpose",
  },
};

function fakeCrashTests(outcome: Outcome = DONE) {
  const calls: string[] = [];
  const thrown: Error[] = [];
  const backend: CrashTestBackend = {
    panicInCore: () => {
      calls.push("panicInCore");
      return Promise.resolve(outcome);
    },
    crashAndQuit: () => {
      calls.push("crashAndQuit");
      return Promise.resolve(outcome);
    },
  };
  const reporting = {
    offerSaved: () => {
      calls.push("offerSaved");
      return Promise.resolve();
    },
  };
  const tests = new CrashTests(backend, reporting, (error) => {
    thrown.push(error);
  });
  return { tests, calls, thrown };
}

test("offers the report a panic in the core left, as the next launch would", async () => {
  const { tests, calls } = fakeCrashTests();

  await tests.panicInCore();

  expect(calls).toEqual(["panicInCore", "offerSaved"]);
});

test("offers nothing when the core refuses to panic, and says why", async () => {
  const { tests, calls } = fakeCrashTests(REFUSED);

  const panicking = tests.panicInCore();

  await expect(panicking).rejects.toThrow(CrashTestRefused);
  await expect(panicking).rejects.toThrow(REFUSED.error.message);
  expect(calls).toEqual(["panicInCore"]);
});

test("throws an interface error that nothing handles", () => {
  const { tests, thrown } = fakeCrashTests();

  tests.throwInterfaceError();

  expect(thrown).toHaveLength(1);
  expect(thrown[0]).toBeInstanceOf(InterfaceErrorTest);
});

test("asks the core to crash and quit", async () => {
  const { tests, calls } = fakeCrashTests();

  await tests.crashAndQuit();

  expect(calls).toEqual(["crashAndQuit"]);
});

test("says why the core refused to crash and quit", async () => {
  const { tests } = fakeCrashTests(REFUSED);

  await expect(tests.crashAndQuit()).rejects.toThrow(CrashTestRefused);
});
