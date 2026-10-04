import { fileURLToPath } from "node:url";

import {
  type RunningProcess,
  startWebDriverProcess,
} from "./webdriver-process.ts";

const PICKED_FOLDER_VARIABLE = "OMNILEAF_E2E_PICKED_FOLDER";
const CRASH_REPORT_FOLDER_VARIABLE = "OMNILEAF_E2E_CRASH_REPORTS";
const DATA_DIR_VARIABLE = "OMNILEAF_DATA_DIR";
const EXECUTABLE_SUFFIX = process.platform === "win32" ? ".exe" : "";
const APP_BINARY = fileURLToPath(
  new URL(
    `../../../target/debug/omnileaf-app${EXECUTABLE_SUFFIX}`,
    import.meta.url,
  ),
);

export interface DesktopLaunch {
  /** Where the app's own WebDriver server listens. */
  readonly port: number;
  /** Where the app keeps its library, which a later launch on the same folder finds again. */
  readonly dataDir: string;
  /** The folder that answers the folder picker. */
  readonly pickedFolder: string;
  /** Where the app keeps crash reports, so tests leave none in the platform's folders. */
  readonly crashReports: string;
}

export interface DesktopApp extends RunningProcess {
  readonly server: URL;
}

/** Launches the end-to-end build of the app and waits for its WebDriver server. */
export async function launchDesktopApp(
  launch: DesktopLaunch,
): Promise<DesktopApp> {
  const server = new URL(`http://127.0.0.1:${String(launch.port)}/`);
  const running = await startWebDriverProcess({
    command: APP_BINARY,
    args: [],
    env: {
      ...process.env,
      TAURI_WEBDRIVER_PORT: String(launch.port),
      [PICKED_FOLDER_VARIABLE]: launch.pickedFolder,
      [DATA_DIR_VARIABLE]: launch.dataDir,
      [CRASH_REPORT_FOLDER_VARIABLE]: launch.crashReports,
    },
    server,
  });
  return { ...running, server };
}
