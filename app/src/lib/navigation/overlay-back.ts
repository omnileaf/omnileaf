import type { Attachment } from "svelte/attachments";

import { commands } from "#lib/ipc/bindings.ts";
import { currentPlatform } from "#lib/page/platform.ts";

import { followsHistoryForBack } from "./android-back";

export interface PageHistory {
  push(): () => boolean;
  back(): void;
  onBack(listener: () => void): () => void;
}

interface HeldEntry {
  readonly close: () => void;
  isOnEntry: () => boolean;
  isPopped: boolean;
}

export class OverlayBack {
  readonly #history: PageHistory;
  readonly #tell: () => void;
  readonly #isOn: () => boolean;
  #held: readonly HeldEntry[] = [];
  #ownPops = 0;
  #stopListening: (() => void) | undefined;

  constructor(history: PageHistory, tell: () => void, isOn: () => boolean) {
    this.#history = history;
    this.#tell = tell;
    this.#isOn = isOn;
  }

  /** Android only hands back to the page while its history has an entry to go back to. */
  hold(close: () => void): () => void {
    if (!this.#isOn()) {
      return () => undefined;
    }
    const entry: HeldEntry = { close, isOnEntry: () => true, isPopped: false };
    this.#held = [...this.#held, entry];
    this.#stopListening ??= this.#history.onBack(() => {
      this.#backed();
    });
    entry.isOnEntry = this.#history.push();
    this.#tell();
    return () => {
      this.#release(entry);
    };
  }

  #backed(): void {
    if (this.#ownPops > 0) {
      this.#ownPops -= 1;
      this.#stopWhenIdle();
      return;
    }
    const top = this.#held.findLast((entry) => !entry.isPopped);
    if (top !== undefined) {
      top.isPopped = true;
      top.close();
    }
  }

  #release(entry: HeldEntry): void {
    this.#held = this.#held.filter((held) => held !== entry);
    if (!entry.isPopped && entry.isOnEntry()) {
      this.#ownPops += 1;
      this.#history.back();
    }
    this.#stopWhenIdle();
    this.#tell();
  }

  #stopWhenIdle(): void {
    if (this.#held.length === 0 && this.#ownPops === 0) {
      this.#stopListening?.();
      this.#stopListening = undefined;
    }
  }
}

const windowHistory: PageHistory = {
  push: () => {
    history.pushState(history.state, "", location.href);
    const entry = JSON.stringify(history.state);
    const url = location.href;
    return () =>
      location.href === url && JSON.stringify(history.state) === entry;
  },
  back: () => {
    history.back();
  },
  onBack: (listener) => {
    addEventListener("popstate", listener);
    return () => {
      removeEventListener("popstate", listener);
    };
  },
};

const SHELL_BRIDGE = "__TAURI_INTERNALS__";

/** Tauri's bridge exists only inside the app's own shell, so a page in a plain browser has no command to call. */
function followHistory(): void {
  if (SHELL_BRIDGE in window) {
    void commands.followBackHistory();
  }
}

const overlays = new OverlayBack(windowHistory, followHistory, () =>
  followsHistoryForBack(currentPlatform()),
);

function closeLikeEscape(element: HTMLElement): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

export const closesOnBack: Attachment<HTMLElement> = (element) =>
  overlays.hold(() => {
    closeLikeEscape(element);
  });
