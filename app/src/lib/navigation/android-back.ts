import { afterNavigate, type NavigationType } from "$app/navigation";
import { commands, type Platform } from "#lib/ipc/bindings.ts";

interface Arrival {
  readonly type: NavigationType;
}

type AfterEachNavigation = (listen: (arrival: Arrival) => void) => void;

const FOLLOWS_HISTORY_FOR_BACK = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export function followsHistoryForBack(platform: Platform): boolean {
  return FOLLOWS_HISTORY_FOR_BACK[platform];
}

export class BackDepth {
  #screensPushed = 0;
  #overlaysHeld = 0;

  get canGoBack(): boolean {
    return this.#screensPushed + this.#overlaysHeld > 0;
  }

  arrived(type: NavigationType): void {
    switch (type) {
      case "enter":
        this.#screensPushed = 0;
        break;
      case "form":
      case "goto":
      case "link":
        this.#screensPushed += 1;
        break;
      case "popstate":
        this.#screensPushed = Math.max(0, this.#screensPushed - 1);
        break;
      case "leave":
        break;
    }
  }

  overlayHeld(): void {
    this.#overlaysHeld += 1;
  }

  overlayReleased(): void {
    this.#overlaysHeld = Math.max(0, this.#overlaysHeld - 1);
  }
}

const SHELL_BRIDGE = "__TAURI_INTERNALS__";

export const depth = new BackDepth();

/** Tauri's bridge exists only inside the app's own shell, so a page in a plain browser has no command to call. */
export function tellAndroidHowFarBack(): void {
  if (SHELL_BRIDGE in window) {
    void commands.followBackHistory(depth.canGoBack);
  }
}

function afterEveryNavigation(listener: (arrival: Arrival) => void): void {
  afterNavigate((navigation) => {
    listener({ type: navigation.type });
  });
}

export function followHistoryForBack(
  platform: () => Platform,
  afterEachNavigation: AfterEachNavigation = afterEveryNavigation,
  follow: (canGoBack: boolean) => Promise<unknown> = commands.followBackHistory,
): void {
  afterEachNavigation((arrival) => {
    if (!followsHistoryForBack(platform())) {
      return;
    }
    depth.arrived(arrival.type);
    void follow(depth.canGoBack);
  });
}
