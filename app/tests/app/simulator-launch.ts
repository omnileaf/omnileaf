import { isRecord } from "./json.ts";
import { pollUntil } from "./webdriver.ts";

const UNKNOWN_TO_LAUNCHER = "FBSOpenApplicationServiceErrorDomain";
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

/** Waits for the Simulator's launcher to register a just-installed app; a launch that hangs saves the Simulator's logs and fails naming them. */
export async function launchOnceRegistered(
  bundleId: string,
  launch: () => Promise<unknown>,
  saveLogs: () => Promise<string>,
): Promise<void> {
  const what = `launching ${bundleId} on the Simulator`;
  await pollUntil(
    async () => {
      try {
        await launch();
        return true;
      } catch (error) {
        if (isUnknownToLauncher(error)) {
          return undefined;
        }
        if (isKilledByItsTimeout(error)) {
          throw new HungLaunchError(
            `${what} hung; the Simulator's logs are in ${await saveLogs()}`,
            { cause: error },
          );
        }
        throw error;
      }
    },
    LAUNCHABLE_TIMEOUT_MS,
    what,
  );
}
