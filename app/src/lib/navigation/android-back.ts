import { afterNavigate } from "$app/navigation";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

type AfterEachNavigation = (listener: () => void) => void;

const FOLLOWS_HISTORY_FOR_BACK = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

const SHELL_BRIDGE = "__TAURI_INTERNALS__";

export function followsHistoryForBack(platform: Platform): boolean {
  return FOLLOWS_HISTORY_FOR_BACK[platform];
}

export class BackDepth {
  #pushed = 0;

  get canGoBack(): boolean {
    return this.#pushed > 0;
  }

  pushed(): void {
    this.#pushed += 1;
  }

  popped(): void {
    this.#pushed = Math.max(0, this.#pushed - 1);
  }
}

export const depth = new BackDepth();

declare global {
  interface Window {
    __omnileafLastStepBack?: number;
  }
}

/** Android's WebView keeps no entry for a `pushState`, so the page counts the entries it pushes itself. */
function countEntriesPushed(): void {
  const pushState = history.pushState.bind(history);
  history.pushState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    pushState(data, unused, url);
    depth.pushed();
    tellAndroidHowFarBack();
  };
  addEventListener("popstate", () => {
    window.__omnileafLastStepBack = Date.now();
    depth.popped();
    tellAndroidHowFarBack();
  });
}

/** Tauri's bridge exists only inside the app's own shell, so a page in a plain browser has no command to call. */
export function tellAndroidHowFarBack(): void {
  if (SHELL_BRIDGE in window) {
    void commands.followBackHistory(depth.canGoBack);
  }
}

countEntriesPushed();

export function followHistoryForBack(
  platform: () => Platform,
  afterEachNavigation: AfterEachNavigation = afterNavigate,
  follow: () => Promise<unknown> = () =>
    commands.followBackHistory(depth.canGoBack),
): void {
  afterEachNavigation(() => {
    if (followsHistoryForBack(platform())) {
      void follow();
    }
  });
}
