import { execFile } from "node:child_process";
import { promisify } from "node:util";

const MAIN_ACTIVITY = "app.omnileaf/.MainActivity";
const OPEN_ICON_ACTION = "app.omnileaf.OPEN_ICON_ACTION";
const CHOSEN_ICON_ACTION = "app.omnileaf.CHOSEN_ICON_ACTION";
const ADB_TIMEOUT_MS = 30_000;

export const NEW_TASK = 0x10000000;

const run = promisify(execFile);

/** Starts the activity as a launcher shortcut does, since where the icon sits and how its menu looks differ from launcher to launcher. */
export async function chooseOnTheIcon(
  action: string,
  flags = NEW_TASK,
): Promise<void> {
  await run(
    "adb",
    [
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      MAIN_ACTIVITY,
      "-f",
      `0x${flags.toString(16)}`,
      "-a",
      OPEN_ICON_ACTION,
      "--es",
      CHOSEN_ICON_ACTION,
      action,
    ],
    { timeout: ADB_TIMEOUT_MS },
  );
}
