import type { Attachment } from "svelte/attachments";

import { beforeNavigate, goto } from "$app/navigation";
import type { PageRouteId } from "$app/types";
import { reportFailure } from "#lib/errors/report-failure.ts";
import { currentPlatform } from "#lib/page/platform.ts";

import { resolvedPathOf } from "./app-path";
import { followsHistoryForBack, tellAndroidHowFarBack } from "./android-back";

export interface PageHistory {
  push(): () => boolean;
  back(): void;
  onBack(listener: () => void): () => void;
}

interface HeldEntry {
  readonly close: () => void;
  isOnEntry: () => boolean;
  isPopped: boolean;
  isGivenBack: boolean;
}

export class OverlayBack {
  readonly #history: PageHistory;
  readonly #tell: () => void;
  readonly #isOn: () => boolean;
  #held: readonly HeldEntry[] = [];
  #ownPops = 0;
  #waiting: readonly (() => void)[] = [];
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
      isPopped: false,
      isGivenBack: false,
    };
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

  holdsEntries(): boolean {
    return this.#giveable().length > 0;
  }

  #giveable(): readonly HeldEntry[] {
    return this.#held.filter(
      (entry) => !entry.isPopped && !entry.isGivenBack && entry.isOnEntry(),
    );
  }

  giveBack(): Promise<void> {
    const given = this.#giveable();
    for (const entry of given) {
      entry.isGivenBack = true;
      this.#ownPops += 1;
      this.#history.back();
    }
    return given.length === 0
      ? Promise.resolve()
      : new Promise((settle) => {
          this.#waiting = [...this.#waiting, settle];
        });
  }

  #backed(): void {
    if (this.#ownPops > 0) {
      this.#ownPops -= 1;
      if (this.#ownPops === 0) {
        this.#settleWaiting();
      }
      this.#stopWhenIdle();
      return;
    }
    const top = this.#held.findLast((entry) => !entry.isPopped);
    if (top !== undefined) {
      top.isPopped = true;
      top.close();
    }
  }

  #settleWaiting(): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const settle of waiting) {
      settle();
    }
  }

  #release(entry: HeldEntry): void {
    this.#held = this.#held.filter((held) => held !== entry);
    if (!entry.isPopped && !entry.isGivenBack && entry.isOnEntry()) {
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

const overlays = new OverlayBack(windowHistory, tellAndroidHowFarBack, () =>
  followsHistoryForBack(currentPlatform()),
);

export const giveBackOverlayEntries = (): Promise<void> => overlays.giveBack();

export function leaveOverlaysThen(go: () => Promise<unknown>): void {
  void overlays.giveBack().then(go).catch(reportFailure);
}

export function giveBackOverlayEntriesBeforeLinkTo(routeId: PageRouteId): void {
  beforeNavigate(({ type, to, cancel }) => {
    if (
      type !== "link" ||
      to?.route.id !== routeId ||
      !overlays.holdsEntries()
    ) {
      return;
    }
    cancel();
    leaveOverlaysThen(() => goto(resolvedPathOf(to.url)));
  });
}

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
