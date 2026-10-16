import { expect, test } from "vitest";

import type { IpcError, StorageUse } from "#lib/ipc/bindings.ts";

import { type StorageCommands, StorageCheck } from "./storage-check.svelte";

const USED: StorageUse = {
  omnileafBytes: 1_440_000_000,
  cachedPagesBytes: 1_200_000_000,
  coversBytes: 210_000_000,
  freeBytes: 1_100_000_000,
  totalBytes: 128_000_000_000,
  isLow: true,
};
const FAILED: IpcError = {
  code: "internal",
  message: "the disk can't be read",
};

function storageOf(asked: string[], used = USED): StorageCommands {
  return {
    checkStorage: () => {
      asked.push("check");
      return Promise.resolve({ status: "ok", data: used });
    },
    clearCachedPages: () => {
      asked.push("clear pages");
      return Promise.resolve({ status: "ok", data: null });
    },
    clearCovers: () => {
      asked.push("clear covers");
      return Promise.resolve({ status: "ok", data: null });
    },
  };
}

test("knows nothing of the storage until it has checked", () => {
  expect(new StorageCheck(storageOf([]), () => undefined).use).toBeUndefined();
});

test("keeps what the check found", async () => {
  const check = new StorageCheck(storageOf([]), () => undefined);

  await check.check();

  expect(check.use).toEqual(USED);
});

test("clears the cached pages, then checks again", async () => {
  const asked: string[] = [];
  const check = new StorageCheck(storageOf(asked), () => undefined);

  await check.clear("cachedPages");

  expect(asked).toEqual(["clear pages", "check"]);
});

test("clears the covers, then checks again", async () => {
  const asked: string[] = [];
  const check = new StorageCheck(storageOf(asked), () => undefined);

  await check.clear("covers");

  expect(asked).toEqual(["clear covers", "check"]);
});

test("says which cache it's clearing until it's done", async () => {
  const check = new StorageCheck(storageOf([]), () => undefined);

  const clearing = check.clear("covers");
  const during = check.clearing;
  await clearing;

  expect([during, check.clearing]).toEqual(["covers", undefined]);
});

test("reports a check that fails and keeps what it found before", async () => {
  let fails = false;
  const reported: IpcError[] = [];
  const check = new StorageCheck(
    {
      ...storageOf([]),
      checkStorage: () =>
        Promise.resolve(
          fails
            ? { status: "error", error: FAILED }
            : { status: "ok", data: USED },
        ),
    },
    (error) => {
      reported.push(error);
    },
  );
  await check.check();

  fails = true;
  await check.check();

  expect([check.use, reported]).toEqual([USED, [FAILED]]);
});
