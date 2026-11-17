import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const ANDROID_APP_ID = "app.omnileaf";

const ADB_TIMEOUT_MS = 30_000;
const UNSET_SETTING = "null";

const run = promisify(execFile);

export interface AndroidSetting {
  read(): Promise<string>;
  put(value: string): Promise<void>;
  restore(before: string): Promise<void>;
}

export async function adbShell(...command: readonly string[]): Promise<string> {
  const { stdout } = await run("adb", ["shell", ...command], {
    timeout: ADB_TIMEOUT_MS,
  });
  return stdout.trim();
}

function settingsCommand(...args: readonly string[]): Promise<string> {
  return adbShell("settings", ...args);
}

export function androidSetting(
  namespace: "system" | "secure",
  name: string,
): AndroidSetting {
  const put = async (value: string): Promise<void> => {
    await settingsCommand("put", namespace, name, value);
  };
  return {
    read: () => settingsCommand("get", namespace, name),
    put,
    restore: async (before) => {
      if (before === UNSET_SETTING) {
        await settingsCommand("delete", namespace, name);
        return;
      }
      await put(before);
    },
  };
}
