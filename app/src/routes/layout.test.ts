import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import type { AppInfo, commands } from "#lib/ipc/bindings.ts";

import type { LayoutLoadEvent } from "./$types";
import { load } from "./+layout";

const LIBRARY = "/";
const FIRST_LAUNCH = "/first-launch";
const SAVED_PAGE = "/settings/appearance";

const ANDROID_APP: AppInfo = {
  version: "1.2.3",
  platform: "android",
  sourceCode: "repo.example.org/omnileaf",
  isDevelopmentBuild: false,
  checksForUpdates: false,
  windowBackdrop: "none",
};

type LibraryProblem = Awaited<ReturnType<typeof commands.libraryProblem>>;

interface RebuiltApp {
  readonly libraryProblem: LibraryProblem;
  readonly isFirstLaunchFinished: boolean;
}

const OPENABLE_LIBRARY: RebuiltApp = {
  libraryProblem: null,
  isFirstLaunchFinished: true,
};

const COMMANDS_THE_LOAD_STARTS = new Set([
  "remember_app_lock_words",
  "watch_system_bold_text",
  "watch_system_contrast",
]);

function serveAndroidRebuiltOn(savedPage: string, app: RebuiltApp): void {
  mockIPC((command) => {
    switch (command) {
      case "app_info":
        return ANDROID_APP;
      case "library_problem":
        return app.libraryProblem;
      case "home_arrival":
        return null;
      case "first_launch_finished":
        return app.isFirstLaunchFinished;
      case "take_restored_route":
        return savedPage;
      default:
        if (COMMANDS_THE_LOAD_STARTS.has(command)) {
          return null;
        }
        throw new Error(`the test serves no command \`${command}\``);
    }
  });
}

function openingAt(pathname: string): LayoutLoadEvent {
  return {
    url: new URL(pathname, location.origin),
    params: {},
    route: { id: "/(app)" },
    data: null,
    fetch,
    setHeaders: () => undefined,
    parent: () => Promise.resolve({}),
    depends: () => undefined,
    untrack: (read) => read(),
    tracing: { enabled: false, root: {}, current: {} },
  };
}

afterEach(() => {
  clearMocks();
});

test("drops the page Android saved when the library has a problem", async () => {
  serveAndroidRebuiltOn(SAVED_PAGE, {
    ...OPENABLE_LIBRARY,
    libraryProblem: "couldNotOpen",
  });

  const loaded = await load(openingAt(LIBRARY));

  expect(loaded).toHaveProperty("pageToRestore", undefined);
});

test("opens first launch instead of the page Android saved", async () => {
  serveAndroidRebuiltOn(SAVED_PAGE, {
    ...OPENABLE_LIBRARY,
    isFirstLaunchFinished: false,
  });

  const loading = load(openingAt(LIBRARY));

  await expect(loading).rejects.toMatchObject({
    status: 307,
    location: FIRST_LAUNCH,
  });
});

test("hands the layout the page Android saved", async () => {
  serveAndroidRebuiltOn(SAVED_PAGE, OPENABLE_LIBRARY);

  const loaded = await load(openingAt(LIBRARY));

  expect(loaded).toHaveProperty("pageToRestore", SAVED_PAGE);
});
