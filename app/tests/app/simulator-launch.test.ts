import { expect, onTestFinished, test, vi } from "vitest";

import { HungLaunchError, launchOnceRegistered } from "./simulator-launch.ts";

const BUNDLE_ID = "app.omnileaf";
const LAUNCH_COMMAND = `xcrun simctl launch --terminate-running-process booted ${BUNDLE_ID}`;
const SAVED_LOGS = "app/test-results/ios-launch-hang.log";

function launchFailure(fields: Readonly<Record<string, unknown>>): Error {
  return Object.assign(new Error(`Command failed: ${LAUNCH_COMMAND}`), {
    cmd: LAUNCH_COMMAND,
    stdout: "",
    ...fields,
  });
}

function killedByItsTimeout(): Error {
  return launchFailure({
    code: null,
    killed: true,
    signal: "SIGTERM",
    stderr: "",
  });
}

function unknownToLauncher(): Error {
  return launchFailure({
    code: 4,
    killed: false,
    signal: null,
    stderr:
      "An error was encountered processing the command (domain=FBSOpenApplicationServiceErrorDomain, code=4)",
  });
}

function refusedOutright(): Error {
  return launchFailure({
    code: 1,
    killed: false,
    signal: null,
    stderr: "Invalid device: booted",
  });
}

function launchesInTurn(outcomes: readonly (Error | undefined)[]): {
  readonly launch: () => Promise<void>;
  readonly launched: () => number;
} {
  let calls = 0;
  return {
    launch: () => {
      const outcome = outcomes[Math.min(calls, outcomes.length - 1)];
      calls += 1;
      return outcome === undefined
        ? Promise.resolve()
        : Promise.reject(outcome);
    },
    launched: () => calls,
  };
}

function logsSaver(): {
  readonly saveLogs: () => Promise<string>;
  readonly saved: () => number;
} {
  let saves = 0;
  return {
    saveLogs: () => {
      saves += 1;
      return Promise.resolve(SAVED_LOGS);
    },
    saved: () => saves,
  };
}

test("keeps launching while the launcher does not know the app yet", async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const app = launchesInTurn([unknownToLauncher(), undefined]);
  const logs = logsSaver();

  const launching = launchOnceRegistered(BUNDLE_ID, app.launch, logs.saveLogs);
  await vi.runAllTimersAsync();

  await expect(launching).resolves.toBeUndefined();
  expect([app.launched(), logs.saved()]).toEqual([2, 0]);
});

test("saves the launch logs and fails without launching again when a launch is killed by its timeout", async () => {
  const app = launchesInTurn([killedByItsTimeout(), undefined]);
  const logs = logsSaver();

  const launched = launchOnceRegistered(BUNDLE_ID, app.launch, logs.saveLogs);

  await expect(launched).rejects.toThrow(HungLaunchError);
  await expect(launched).rejects.toThrow(
    `launching ${BUNDLE_ID} on the Simulator did not finish in time; the Simulator's logs are in ${SAVED_LOGS}`,
  );
  expect([app.launched(), logs.saved()]).toEqual([1, 1]);
});

test("fails at once without saving logs when the launch is refused outright", async () => {
  const refused = refusedOutright();
  const app = launchesInTurn([refused, undefined]);
  const logs = logsSaver();

  const launched = launchOnceRegistered(BUNDLE_ID, app.launch, logs.saveLogs);

  await expect(launched).rejects.toBe(refused);
  expect([app.launched(), logs.saved()]).toEqual([1, 0]);
});
