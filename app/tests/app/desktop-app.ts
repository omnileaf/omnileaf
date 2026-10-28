import { fileURLToPath } from "node:url";

import {
  type RunningProcess,
  startWebDriverProcess,
} from "./webdriver-process.ts";

const PICKED_FOLDER_VARIABLE = "OMNILEAF_E2E_PICKED_FOLDER";
const CRASH_REPORT_FOLDER_VARIABLE = "OMNILEAF_E2E_CRASH_REPORTS";
const DATA_DIR_VARIABLE = "OMNILEAF_DATA_DIR";
const SINGLE_INSTANCE_VARIABLE = "OMNILEAF_E2E_SINGLE_INSTANCE";
const EXECUTABLE_SUFFIX = process.platform === "win32" ? ".exe" : "";
export const APP_BINARY = fileURLToPath(
  new URL(
    `../../../target/debug/omnileaf-app${EXECUTABLE_SUFFIX}`,
    import.meta.url,
  ),
);

export interface DesktopLaunch {
  readonly webDriverPort: number;
  readonly dataDir: string;
  readonly pickedFolder: string;
  /** Where the app keeps crash reports, so tests leave none in the platform's folders. */
  readonly crashReports: string;
  /** Files handed to the app on launch, as the file manager does. */
  readonly files?: readonly string[];
  /** Has the app refuse a second launch and hand it to the running one, which test builds skip so specs can run apps beside each other. */
  readonly singleInstance?: boolean;
}

export function appEnvironment(launch: DesktopLaunch): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TAURI_WEBDRIVER_PORT: String(launch.webDriverPort),
    [PICKED_FOLDER_VARIABLE]: launch.pickedFolder,
    [DATA_DIR_VARIABLE]: launch.dataDir,
    [CRASH_REPORT_FOLDER_VARIABLE]: launch.crashReports,
    ...(launch.singleInstance === true
      ? { [SINGLE_INSTANCE_VARIABLE]: "1" }
      : {}),
  };
}

export interface DesktopApp extends RunningProcess {
  readonly server: URL;
}

export async function launchDesktopApp(
  launch: DesktopLaunch,
): Promise<DesktopApp> {
  const server = new URL(`http://127.0.0.1:${String(launch.webDriverPort)}/`);
  const running = await startWebDriverProcess({
    command: APP_BINARY,
    args: launch.files ?? [],
    env: appEnvironment(launch),
    server,
  });
  return { ...running, server };
}
