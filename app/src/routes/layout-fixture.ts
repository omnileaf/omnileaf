import { mockIPC } from "@tauri-apps/api/mocks";

import type { AppInfo, commands } from "#lib/ipc/bindings.ts";

import type { LayoutLoadEvent } from "./$types";

export const LIBRARY = "/";
export const SAVED_PAGE = "/settings/appearance";
export const ASK_FOR_THE_SAVED_PAGE = "saved_route";

const ANDROID_APP: AppInfo = {
  version: "1.2.3",
  platform: "android",
  sourceCode: "repo.example.org/omnileaf",
  isDevelopmentBuild: false,
  windowBackdrop: "none",
  checksForUpdates: false,
};

type LibraryProblem = Awaited<ReturnType<typeof commands.libraryProblem>>;

interface RebuiltApp {
  readonly libraryProblem: LibraryProblem;
  readonly isFirstLaunchFinished: boolean;
}

export const OPENABLE_LIBRARY: RebuiltApp = {
  libraryProblem: null,
  isFirstLaunchFinished: true,
};

const COMMANDS_THE_LOAD_STARTS = new Set([
  "remember_app_lock_words",
  "watch_system_bold_text",
  "watch_system_contrast",
]);

export function serveAndroidRebuiltOn(
  savedPage: string,
  app: RebuiltApp,
): readonly string[] {
  const asked: string[] = [];
  mockIPC((command) => {
    asked.push(command);
    switch (command) {
      case "app_info":
        return ANDROID_APP;
      case "library_problem":
        return app.libraryProblem;
      case "home_arrival":
        return null;
      case "first_launch_finished":
        return app.isFirstLaunchFinished;
      case ASK_FOR_THE_SAVED_PAGE:
        return savedPage;
      default:
        if (COMMANDS_THE_LOAD_STARTS.has(command)) {
          return null;
        }
        throw new Error(`the test serves no command \`${command}\``);
    }
  });
  return asked;
}

export function openingAt(pathname: string): LayoutLoadEvent {
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
