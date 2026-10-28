import { execFile } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, inject, test } from "vitest";

import {
  APP_BINARY,
  appEnvironment,
  type DesktopApp,
  launchDesktopApp,
} from "./desktop-app.ts";
import { finishFirstLaunchIfShown } from "./first-launch.ts";
import { removeFolder } from "./remove-folder.ts";
import { Session, xpath } from "./webdriver.ts";

const WEBDRIVER_PORT = 4447;
const LAUNCH_TIMEOUT_MS = 120_000;
const OPEN_TIMEOUT_MS = 60_000;
const SECOND_LAUNCH_TIMEOUT_MS = 30_000;

const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
const ON_A_BOOK = "return location.pathname.startsWith('/read/');";

const run = promisify(execFile);

let dataDir: string | undefined;
let crashReports: string | undefined;
let app: DesktopApp | undefined;
let session: Session | undefined;
let files: readonly string[] = [];

function current(): Session {
  if (session === undefined) {
    throw new Error("the WebDriver session did not start");
  }
  return session;
}

async function comicFilesIn(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith(".cbz"))
    .toSorted()
    .map((entry) => join(folder, entry));
}

function launching(): Parameters<typeof launchDesktopApp>[0] {
  if (dataDir === undefined || crashReports === undefined) {
    throw new Error("the data folders were not made");
  }
  return {
    webDriverPort: WEBDRIVER_PORT,
    dataDir,
    pickedFolder: inject("sampleLibraryFolder"),
    crashReports,
    singleInstance: true,
    files: files.slice(0, 1),
  };
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "omnileaf-e2e-open-file-"));
  crashReports = await mkdtemp(
    join(tmpdir(), "omnileaf-e2e-open-file-crashes-"),
  );
  files = await comicFilesIn(inject("sampleLibraryFolder"));
  app = await launchDesktopApp(launching());
  session = await Session.start(app.server, {});
  await finishFirstLaunchIfShown(session);
}, LAUNCH_TIMEOUT_MS);

afterAll(async () => {
  try {
    await session?.end();
    await app?.stop();
  } finally {
    for (const folder of [dataDir, crashReports]) {
      if (folder !== undefined) {
        await removeFolder(folder);
      }
    }
  }
}, LAUNCH_TIMEOUT_MS);

test(
  "opens the file the app was launched with, and the file a second launch hands to the running app",
  async () => {
    await current().waitUntil(ON_A_BOOK, "a book of the launch file open");
    await current().waitFor(NEXT_PAGE);
    const first = new URL(await current().url()).pathname;
    const second = files.at(1);
    expect(second).toBeDefined();
    if (
      dataDir === undefined ||
      crashReports === undefined ||
      second === undefined
    ) {
      return;
    }

    await run(APP_BINARY, [second], {
      env: appEnvironment({ ...launching(), files: [second] }),
      timeout: SECOND_LAUNCH_TIMEOUT_MS,
    });

    await current().waitUntil(
      `return location.pathname.startsWith('/read/') && location.pathname !== ${JSON.stringify(first)};`,
      "the second file's book open",
    );
  },
  OPEN_TIMEOUT_MS,
);
