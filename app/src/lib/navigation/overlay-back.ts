import type { Attachment } from "svelte/attachments";

import { beforeNavigate, goto } from "$app/navigation";
import type { PageRouteId } from "$app/types";
import { reportFailure } from "#lib/errors/report-failure.ts";
import { currentPlatform } from "#lib/page/platform.ts";

import { resolvedPathOf } from "./app-path";
import { followsHistoryForBack, tellAndroidHowFarBack } from "./android-back";
import type { BackGestureStep } from "./back-preview";

export interface PageHistory {
  push(): () => boolean;
  back(): void;
  onBack(listener: () => void): () => void;
}

export interface BackFollower {
  follow(step: BackGestureStep): void;
  closed?(): void;
  gone?(): void;
}

interface HeldEntry {
  readonly close: () => void;
  readonly follower: BackFollower | undefined;
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
  #following: BackFollower | undefined;
  #ownPops = 0;
  #waiting: readonly (() => void)[] = [];
  #stopListening: (() => void) | undefined;

  constructor(history: PageHistory, tell: () => void, isOn: () => boolean) {
    this.#history = history;
    this.#tell = tell;
    this.#isOn = isOn;
  }

  /** Android only hands back to the page while its history has an entry to go back to. */
  hold(close: () => void, follower?: BackFollower): () => void {
    if (!this.#isOn()) {
      return () => undefined;
    }
    const entry: HeldEntry = {
      close,
      follower,
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

  followBack(step: BackGestureStep): void {
    if (step.kind === "started") {
      this.#following = this.#held.findLast((entry) =>
        isGiveable(entry),
      )?.follower;
    }
    this.#following?.follow(step);
    if (step.kind === "ended") {
      this.#following = undefined;
    }
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

export const followOverlayBack = (step: BackGestureStep): void => {
  overlays.followBack(step);
};

export const giveBackOverlayEntries = (): Promise<void> => overlays.giveBack();

export function leaveOverlaysThen(go: () => Promise<unknown>): void {
  void overlays.giveBack().then(go).catch(reportFailure);
}

export function giveBackOverlayEntriesBeforeLinkTo(routeId: PageRouteId): void {
  beforeNavigate(({ type, to, cancel }) => {
    if (
      type !== "link" ||
      to?.route.id !== routeId ||
      !overlays.mustGiveBackBeforeLeaving()
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

export function holdBack(
  close: () => void,
  follower?: BackFollower,
): () => void {
  return overlays.hold(close, follower);
}

export const closesOnBackFollowedBy =
  (follower: BackFollower): Attachment<HTMLElement> =>
  (element) => {
    const release = holdBack(() => {
      closeLikeEscape(element);
      follower.closed?.();
    }, follower);
    return () => {
      release();
      follower.gone?.();
    };
  };

export const closesOnBack: Attachment<HTMLElement> = (element) =>
  holdBack(() => {
    closeLikeEscape(element);
  });
