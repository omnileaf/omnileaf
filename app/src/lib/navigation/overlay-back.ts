import type { Attachment } from "svelte/attachments";

import { currentPlatform } from "#lib/page/platform.ts";

import { followsHistoryForBack, tellAndroidHowFarBack } from "./android-back";

export interface PageHistory {
  push(): () => boolean;
  back(): void;
  onBack(listener: () => void): () => void;
}

interface HeldEntry {
  readonly close: () => void;
  isOnEntry: () => boolean;
  isPushed: boolean;
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
    const entry: HeldEntry = {
      close,
      isOnEntry: () => true,
      isPushed: false,
      isPopped: false,
    };
    this.#held = [...this.#held, entry];
    this.#stopListening ??= this.#history.onBack(() => {
      this.#backed();
    });
    if (this.#ownPops === 0) {
      this.#push(entry);
    }
    return () => {
      this.#release(entry);
    };
  }

  #push(entry: HeldEntry): void {
    entry.isOnEntry = this.#history.push();
    entry.isPushed = true;
    this.#tell();
  }

  #backed(): void {
    if (this.#ownPops > 0) {
      this.#ownPops -= 1;
      if (this.#ownPops === 0) {
        this.#pushWaiting();
      }
      this.#stopWhenIdle();
      return;
    }
    const top = this.#held.findLast(
      (entry) => entry.isPushed && !entry.isPopped,
    );
    if (top !== undefined) {
      top.isPopped = true;
      top.close();
    }
  }

  #release(entry: HeldEntry): void {
    this.#held = this.#held.filter((held) => held !== entry);
    if (entry.isPushed && !entry.isPopped && entry.isOnEntry()) {
      this.#ownPops += 1;
      this.#history.back();
    }
    this.#stopWhenIdle();
    this.#tell();
  }

  #pushWaiting(): void {
    for (const entry of this.#held) {
      if (!entry.isPushed) {
        this.#push(entry);
      }
    }
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

const overlays = new OverlayBack(windowHistory, tellAndroidHowFarBack, () =>
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

export function holdBack(close: () => void): () => void {
  return overlays.hold(close);
}

export const closesOnBack: Attachment<HTMLElement> = (element) =>
  holdBack(() => {
    closeLikeEscape(element);
  });
