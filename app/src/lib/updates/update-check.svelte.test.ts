import { expect, test } from "vitest";

import type {
  AppInfo,
  CheckedForUpdates,
  CheckOutcome,
  IpcError,
  Platform,
  UpdateStatus,
} from "#lib/ipc/bindings.ts";

import {
  checkHint,
  offersUpdateCheck,
  type UpdateAsks,
  UpdateCheck,
} from "./update-check.svelte.ts";

const UNCHECKED: UpdateStatus = {
  isAutomatic: false,
  release: { kind: "unchecked" },
};
const UP_TO_DATE: UpdateStatus = {
  isAutomatic: false,
  release: { kind: "upToDate" },
};
const NEWER: UpdateStatus = {
  isAutomatic: false,
  release: {
    kind: "newer",
    version: "0.2.0",
    headline: "Series pages show Volumes, Chapters and Specials as tabs",
    releasePage: "https://github.com/omnileaf/omnileaf/releases/tag/v0.2.0",
    notice: "snoozed",
  },
};
const BROKEN: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};

function appInfo(platform: Platform, checksForUpdates: boolean): AppInfo {
  return {
    version: "0.1.0",
    platform,
    sourceCode: "https://github.com/omnileaf/omnileaf",
    isDevelopmentBuild: false,
    windowBackdrop: "none",
    checksForUpdates,
  };
}

function checked(
  outcome: CheckOutcome,
  status: UpdateStatus = UP_TO_DATE,
): () => Promise<{ status: "ok"; data: CheckedForUpdates }> {
  return () => Promise.resolve({ status: "ok", data: { outcome, status } });
}

function asks(overrides: Partial<UpdateAsks> = {}): UpdateAsks {
  return {
    status: () => Promise.resolve({ status: "ok", data: UNCHECKED }),
    check: checked("upToDate"),
    ...overrides,
  };
}

test("says nothing before the first check", () => {
  expect([checkHint("resting", null), checkHint("resting", UNCHECKED)]).toEqual(
    [undefined, undefined],
  );
});

test("says where the last check left things", () => {
  expect([
    checkHint("resting", UP_TO_DATE),
    checkHint("resting", NEWER),
  ]).toEqual(["Up to date", "Omnileaf 0.2.0 is available"]);
});

test("says a check is running over what was known", () => {
  expect(checkHint("checking", NEWER)).toBe("Checking…");
});

test("asks to try again after a check that failed", () => {
  expect(checkHint("failed", UP_TO_DATE)).toBe("Couldn't check. Try again.");
});

test("offers the check only in an Android build that has it", () => {
  expect([
    offersUpdateCheck(appInfo("android", true)),
    offersUpdateCheck(appInfo("android", false)),
    offersUpdateCheck(appInfo("linux", true)),
  ]).toEqual([true, false, false]);
});

test("loads the status Android keeps", async () => {
  const check = new UpdateCheck(
    asks({ status: () => Promise.resolve({ status: "ok", data: NEWER }) }),
  );

  await check.load();

  expect(check.status).toEqual(NEWER);
});

test("follows the status a check returns", async () => {
  const check = new UpdateCheck(asks({ check: checked("available", NEWER) }));

  await check.check();

  expect([check.phase, check.status]).toEqual(["resting", NEWER]);
});

test("marks a check that could not reach GitHub as failed, keeping the status", async () => {
  const phases = await Promise.all(
    (["offline", "rateLimited", "failed"] as const).map(async (outcome) => {
      const check = new UpdateCheck(asks({ check: checked(outcome, NEWER) }));
      await check.check();
      return [check.phase, check.status];
    }),
  );

  expect(phases).toEqual(Array(3).fill(["failed", NEWER]));
});

test("marks a check the app could not ask as failed", async () => {
  const check = new UpdateCheck(
    asks({ check: () => Promise.resolve({ status: "error", error: BROKEN }) }),
  );

  await check.check();

  expect(check.phase).toBe("failed");
});

test("shows the check running until it answers", async () => {
  let answer: () => void = () => undefined;
  const check = new UpdateCheck(
    asks({
      check: () =>
        new Promise((resolve) => {
          answer = () => {
            resolve({
              status: "ok",
              data: { outcome: "upToDate", status: UP_TO_DATE },
            });
          };
        }),
    }),
  );

  const checking = check.check();
  const phaseWhileWaiting = check.phase;
  answer();
  await checking;

  expect([phaseWhileWaiting, check.phase]).toEqual(["checking", "resting"]);
});

test("asks once for a tap while a check is still running", async () => {
  let asked = 0;
  const check = new UpdateCheck(
    asks({
      check: () => {
        asked += 1;
        return checked("upToDate")();
      },
    }),
  );

  await Promise.all([check.check(), check.check()]);

  expect(asked).toBe(1);
});
