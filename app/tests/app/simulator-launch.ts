import { withAttempts } from "./attempts.ts";
import { isRecord } from "./json.ts";
import { pollUntil } from "./webdriver.ts";

const UNKNOWN_TO_LAUNCHER = "FBSOpenApplicationServiceErrorDomain";
const LAUNCH_ATTEMPTS = 3;
const LAUNCHABLE_TIMEOUT_MS = 60_000;

export class HungLaunchError extends Error {
  override name = "HungLaunchError";
}

function isUnknownToLauncher(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.stderr === "string" &&
    error.stderr.includes(UNKNOWN_TO_LAUNCHER)
  );
}

/** `execFile` sets `killed` only on a command it stopped itself, which it does here only when the command overruns its timeout. */
function isKilledByItsTimeout(error: unknown): boolean {
  return isRecord(error) && error.killed === true;
}

function isHung(error: unknown): boolean {
  return error instanceof HungLaunchError;
}

async function launches(
  launch: () => Promise<unknown>,
  what: string,
): Promise<true | undefined> {
  try {
    await launch();
    return true;
  } catch (error) {
    if (isUnknownToLauncher(error)) {
      return undefined;
    }
    if (isKilledByItsTimeout(error)) {
      throw new HungLaunchError(`${what} hung`, { cause: error });
    }
    throw error;
  }
}

/** Waits for the Simulator's launcher to register a just-installed app, launching again after a hung launch; when every launch hangs it saves the Simulator's logs and fails naming them. */
export async function launchOnceRegistered(
  bundleId: string,
  launch: () => Promise<unknown>,
  saveLogs: () => Promise<string>,
): Promise<void> {
  const what = `launching ${bundleId} on the Simulator`;
  try {
    await withAttempts(
      LAUNCH_ATTEMPTS,
      () =>
        pollUntil(() => launches(launch, what), LAUNCHABLE_TIMEOUT_MS, what),
      isHung,
    );
  } catch (error) {
    if (error instanceof AggregateError) {
      throw new HungLaunchError(
        `${what} hung ${String(LAUNCH_ATTEMPTS)} times; the Simulator's logs are in ${await saveLogs()}`,
        { cause: error },
      );
    }
    throw error;
  }
}
