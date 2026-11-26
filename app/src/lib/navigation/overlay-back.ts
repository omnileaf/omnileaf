import type { Attachment } from "svelte/attachments";

import { beforeNavigate, goto } from "$app/navigation";
import { reportFailure } from "#lib/errors/report-failure.ts";
import { currentPlatform } from "#lib/page/platform.ts";

import { resolvedPathOf } from "./app-path";
import { isInAppShell } from "./sections";
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
  isGivenBack: boolean;
}

function isGiveable(entry: HeldEntry): boolean {
  return (
    entry.isPushed && !entry.isPopped && !entry.isGivenBack && entry.isOnEntry()
  );
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
      isPushed: false,
      isPopped: false,
      isGivenBack: false,
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

  mustGiveBackBeforeLeaving(): boolean {
    return this.#ownPops > 0 || this.willTakeBack();
  }

  willTakeBack(): boolean {
    return this.#held.some((entry) => isGiveable(entry));
  }

  giveBack(): Promise<void> {
    for (const entry of this.#held) {
      if (isGiveable(entry)) {
        this.#ownPops += 1;
        this.#history.back();
      }
      entry.isGivenBack = true;
    }
    return this.#ownPops === 0
      ? Promise.resolve()
      : new Promise((settle) => {
          this.#waiting = [...this.#waiting, settle];
        });
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
        this.#settleWaiting();
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

  #settleWaiting(): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const settle of waiting) {
      settle();
    }
  }

  #release(entry: HeldEntry): void {
    this.#held = this.#held.filter((held) => held !== entry);
    if (isGiveable(entry)) {
      this.#ownPops += 1;
      this.#history.back();
    }
    this.#stopWhenIdle();
    this.#tell();
  }

  #pushWaiting(): void {
    for (const entry of this.#held) {
      if (!entry.isPushed && !entry.isGivenBack) {
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

export const willOverlayTakeBack = (): boolean => overlays.willTakeBack();

export const giveBackOverlayEntries = (): Promise<void> => overlays.giveBack();

export function leaveOverlaysThen(go: () => Promise<unknown>): void {
  void overlays.giveBack().then(go).catch(reportFailure);
}

export interface PageNavigation {
  readonly type: "enter" | "form" | "leave" | "link" | "goto" | "popstate";
  readonly from: { readonly url: URL } | null;
  readonly to: {
    readonly url: URL;
    readonly route: { readonly id: string | null };
  } | null;
}

const LEAVING_TYPES: ReadonlySet<PageNavigation["type"]> = new Set([
  "link",
  "goto",
  "form",
]);

export function mustLeaveOverlaysBefore(
  navigation: PageNavigation,
  overlays: Pick<OverlayBack, "mustGiveBackBeforeLeaving">,
): boolean {
  const { from, to } = navigation;
  if (
    !LEAVING_TYPES.has(navigation.type) ||
    from === null ||
    to === null ||
    from.url.pathname === to.url.pathname
  ) {
    return false;
  }
  const isGuardedLink =
    navigation.type === "link" &&
    to.route.id !== null &&
    isInAppShell(to.route.id);
  return !isGuardedLink && overlays.mustGiveBackBeforeLeaving();
}

export const mustLeaveOverlays = (): boolean =>
  overlays.mustGiveBackBeforeLeaving();

export function giveBackOverlayEntriesBeforeLeavingPage(): void {
  beforeNavigate((navigation) => {
    if (
      !mustLeaveOverlaysBefore(navigation, overlays) ||
      navigation.to === null
    ) {
      return;
    }
    const { url } = navigation.to;
    navigation.cancel();
    leaveOverlaysThen(() => goto(resolvedPathOf(url)));
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

export function holdBack(close: () => void): () => void {
  return overlays.hold(close);
}

export const closesOnBack: Attachment<HTMLElement> = (element) =>
  holdBack(() => {
    closeLikeEscape(element);
  });
