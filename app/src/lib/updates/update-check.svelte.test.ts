import { expect, test, vi } from "vitest";

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

const failures = () => undefined;

function asks(overrides: Partial<UpdateAsks> = {}): UpdateAsks {
  return {
    status: () => Promise.resolve({ status: "ok", data: UNCHECKED }),
    check: checked("upToDate"),
    checkIfDue: checked("upToDate"),
    snooze: () => Promise.resolve({ status: "ok", data: UNCHECKED }),
    skip: () => Promise.resolve({ status: "ok", data: UNCHECKED }),
    openReleasePage: () => Promise.resolve({ status: "ok", data: null }),
    setAutomatic: (isOn) =>
      Promise.resolve({
        status: "ok",
        data: { ...UNCHECKED, isAutomatic: isOn },
      }),
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
    failures,
    asks({ status: () => Promise.resolve({ status: "ok", data: NEWER }) }),
  );

  await check.load();

  expect(check.status).toEqual(NEWER);
});

test("follows the status a check returns", async () => {
  const check = new UpdateCheck(
    failures,
    asks({ check: checked("available", NEWER) }),
  );

  await check.check();

  expect([check.phase, check.status]).toEqual(["resting", NEWER]);
});

test("marks a check that could not reach GitHub as failed, keeping the status", async () => {
  const phases = await Promise.all(
    (["offline", "rateLimited", "failed"] as const).map(async (outcome) => {
      const check = new UpdateCheck(
        failures,
        asks({ check: checked(outcome, NEWER) }),
      );
      await check.check();
      return [check.phase, check.status];
    }),
  );

  expect(phases).toEqual(Array(3).fill(["failed", NEWER]));
});

test("marks a check the app could not ask as failed", async () => {
  const check = new UpdateCheck(
    failures,
    asks({ check: () => Promise.resolve({ status: "error", error: BROKEN }) }),
  );

  await check.check();

  expect(check.phase).toBe("failed");
});

test("shows the check running until it answers", async () => {
  let answer: () => void = () => undefined;
  const check = new UpdateCheck(
    failures,
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
    failures,
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

test("hands on the error when the status could not be read", async () => {
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({ status: () => Promise.resolve({ status: "error", error: BROKEN }) }),
  );

  await check.load();

  expect([check.status, onFailure.mock.calls]).toEqual([null, [[BROKEN]]]);
});

test("hands on the error when the app could not ask for a check", async () => {
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({ check: () => Promise.resolve({ status: "error", error: BROKEN }) }),
  );

  await check.check();

  expect(onFailure.mock.calls).toEqual([[BROKEN]]);
});

test("calls the failure handler on its own, as the browser's reportError needs", async () => {
  const receivers: unknown[] = [];
  function onFailure(this: unknown): void {
    receivers.push(this);
  }
  const check = new UpdateCheck(
    onFailure,
    asks({
      status: () => Promise.resolve({ status: "error", error: BROKEN }),
      check: () => Promise.resolve({ status: "error", error: BROKEN }),
    }),
  );

  await check.load();
  await check.check();

  expect(receivers).toEqual([undefined, undefined]);
});

test("marks the check failed even when the failure handler throws", async () => {
  const check = new UpdateCheck(
    () => {
      throw new TypeError("Illegal invocation");
    },
    asks({ check: () => Promise.resolve({ status: "error", error: BROKEN }) }),
  );

  await check.check().catch(() => undefined);

  expect(check.phase).toBe("failed");
});

test("reads whether checks run on their own from the status", async () => {
  const check = new UpdateCheck(
    failures,
    asks({
      status: () =>
        Promise.resolve({
          status: "ok",
          data: { ...NEWER, isAutomatic: true },
        }),
    }),
  );
  const before = check.isAutomatic;

  await check.load();

  expect([before, check.isAutomatic]).toEqual([false, true]);
});

test("follows the status a due check returns", async () => {
  const check = new UpdateCheck(
    failures,
    asks({ checkIfDue: checked("available", NEWER) }),
  );

  await check.checkIfDue();

  expect([check.phase, check.status]).toEqual(["resting", NEWER]);
});

test("stays quiet when a due check could not reach GitHub", async () => {
  const check = new UpdateCheck(
    failures,
    asks({ checkIfDue: checked("offline", UP_TO_DATE) }),
  );

  await check.checkIfDue();

  expect([check.phase, check.status]).toEqual(["resting", UP_TO_DATE]);
});

test("hands on the error when the app could not ask for a due check", async () => {
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({
      checkIfDue: () => Promise.resolve({ status: "error", error: BROKEN }),
    }),
  );

  await check.checkIfDue();

  expect([check.phase, onFailure.mock.calls]).toEqual(["resting", [[BROKEN]]]);
});

test("turns the automatic check on, then checks when due", async () => {
  const asked: string[] = [];
  const check = new UpdateCheck(
    failures,
    asks({
      setAutomatic: (isOn) => {
        asked.push(`automatic ${String(isOn)}`);
        return Promise.resolve({
          status: "ok",
          data: { ...UNCHECKED, isAutomatic: isOn },
        });
      },
      checkIfDue: () => {
        asked.push("check if due");
        return checked("upToDate", { ...UP_TO_DATE, isAutomatic: true })();
      },
    }),
  );

  await check.setAutomatic(true);

  expect([asked, check.isAutomatic, check.status?.release.kind]).toEqual([
    ["automatic true", "check if due"],
    true,
    "upToDate",
  ]);
});

test("turns the automatic check off without checking", async () => {
  const asked: string[] = [];
  const check = new UpdateCheck(
    failures,
    asks({
      checkIfDue: () => {
        asked.push("check if due");
        return checked("upToDate")();
      },
    }),
  );

  await check.setAutomatic(false);

  expect([asked, check.isAutomatic]).toEqual([[], false]);
});

test("hands on the error when the automatic check could not be changed", async () => {
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({
      setAutomatic: () => Promise.resolve({ status: "error", error: BROKEN }),
    }),
  );

  await check.setAutomatic(true);

  expect([check.isAutomatic, onFailure.mock.calls]).toEqual([
    false,
    [[BROKEN]],
  ]);
});

const SHOWN: UpdateStatus = {
  isAutomatic: false,
  release: {
    kind: "newer",
    version: "0.2.0",
    headline: "Series pages show Volumes, Chapters and Specials as tabs",
    releasePage: "https://github.com/omnileaf/omnileaf/releases/tag/v0.2.0",
    notice: "shown",
  },
};

test("offers the banner only for a newer release whose notice is shown", async () => {
  const shownRelease = await Promise.all(
    [UNCHECKED, UP_TO_DATE, NEWER, SHOWN].map(async (status) => {
      const check = new UpdateCheck(
        failures,
        asks({ status: () => Promise.resolve({ status: "ok", data: status }) }),
      );
      await check.load();
      return check.shownRelease?.version;
    }),
  );

  expect(shownRelease).toEqual([undefined, undefined, undefined, "0.2.0"]);
});

test("puts off the version the person saw, following the status Android returns", async () => {
  const snoozed: string[] = [];
  const check = new UpdateCheck(
    failures,
    asks({
      status: () => Promise.resolve({ status: "ok", data: SHOWN }),
      snooze: (version) => {
        snoozed.push(version);
        return Promise.resolve({ status: "ok", data: NEWER });
      },
    }),
  );
  await check.load();

  await check.snooze("0.2.0");

  expect([snoozed, check.shownRelease]).toEqual([["0.2.0"], undefined]);
});

test("skips the version the person saw, following the status Android returns", async () => {
  const skipped: string[] = [];
  const check = new UpdateCheck(
    failures,
    asks({
      status: () => Promise.resolve({ status: "ok", data: SHOWN }),
      skip: (version) => {
        skipped.push(version);
        return Promise.resolve({ status: "ok", data: NEWER });
      },
    }),
  );
  await check.load();

  await check.skip("0.2.0");

  expect([skipped, check.shownRelease]).toEqual([["0.2.0"], undefined]);
});

test("hands on the error when a choice could not be kept", async () => {
  const onFailure = vi.fn();
  const refuse = () =>
    Promise.resolve({ status: "error", error: BROKEN } as const);
  const check = new UpdateCheck(
    onFailure,
    asks({ snooze: refuse, skip: refuse }),
  );

  await check.snooze("0.2.0");
  await check.skip("0.2.0");

  expect(onFailure.mock.calls).toEqual([[BROKEN], [BROKEN]]);
});

test("says so when the browser could not open the release page, until it opens", async () => {
  let isBrowserMissing = true;
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({
      openReleasePage: () =>
        Promise.resolve(
          isBrowserMissing
            ? ({
                status: "error",
                error: {
                  code: "browserUnavailable",
                  message: "the browser could not be opened",
                },
              } as const)
            : ({ status: "ok", data: null } as const),
        ),
    }),
  );

  await check.openReleasePage();
  const failedFirst = check.hasOpeningFailed;
  isBrowserMissing = false;
  await check.openReleasePage();

  expect([failedFirst, check.hasOpeningFailed, onFailure.mock.calls]).toEqual([
    true,
    false,
    [],
  ]);
});

test("hands on any other error from opening the release page", async () => {
  const onFailure = vi.fn();
  const check = new UpdateCheck(
    onFailure,
    asks({
      openReleasePage: () =>
        Promise.resolve({ status: "error", error: BROKEN }),
    }),
  );

  await check.openReleasePage();

  expect([check.hasOpeningFailed, onFailure.mock.calls]).toEqual([
    false,
    [[BROKEN]],
  ]);
});
