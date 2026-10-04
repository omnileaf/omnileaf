import { expect, onTestFinished, test, vi } from "vitest";

import { launchOnceRegistered } from "./simulator-launch.ts";

const BUNDLE_ID = "app.omnileaf";
const LAUNCH_COMMAND = `xcrun simctl launch --terminate-running-process booted ${BUNDLE_ID}`;

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

test("launches again after a launch is killed by its timeout", async () => {
  const app = launchesInTurn([killedByItsTimeout(), undefined]);

  await launchOnceRegistered(BUNDLE_ID, app.launch);

  expect(app.launched()).toBe(2);
});

test("keeps launching while the launcher does not know the app yet", async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const app = launchesInTurn([unknownToLauncher(), undefined]);

  const launching = launchOnceRegistered(BUNDLE_ID, app.launch);
  await vi.runAllTimersAsync();

  expect(app.launched()).toBe(2);
  await expect(launching).resolves.toBeUndefined();
});

test("fails at once when a launch fails any other way", async () => {
  const invalidDevice = launchFailure({
    code: 164,
    killed: false,
    signal: null,
    stderr: "Invalid device: booted",
  });
  const app = launchesInTurn([invalidDevice, undefined]);

  const launching = launchOnceRegistered(BUNDLE_ID, app.launch);

  await expect(launching).rejects.toBe(invalidDevice);
  expect(app.launched()).toBe(1);
});

test("gives up when every launch hangs", async () => {
  const app = launchesInTurn([killedByItsTimeout()]);

  const launching = launchOnceRegistered(BUNDLE_ID, app.launch);

  await expect(launching).rejects.toThrow(
    `failed 3 times: launching ${BUNDLE_ID} on the Simulator hung`,
  );
  expect(app.launched()).toBe(3);
});
