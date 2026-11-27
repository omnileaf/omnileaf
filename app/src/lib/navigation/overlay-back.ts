import type { Attachment } from "svelte/attachments";

import { beforeNavigate } from "$app/navigation";
import { assertNever } from "#lib/assert-never.ts";
import { reportFailure } from "#lib/errors/report-failure.ts";
import { currentPlatform } from "#lib/page/platform.ts";

import { resolvedPathOf } from "./app-path";
import {
  type NavigationOptions,
  navigateTo,
  navigationStartedTo,
  optionsOfLinkClick,
  type StartedNavigation,
} from "./navigate-to";
import { isInAppShell } from "./sections";
import { followsHistoryForBack, tellAndroidHowFarBack } from "./android-back";
import type { BackGestureStep } from "./back-preview";

export interface PageHistory {
  push(): () => boolean;
  back(steps: number): void;
  onBack(listener: () => void): () => void;
}

export interface BackFollower {
  follow(step: BackGestureStep): void;
  closed?(): void;
  gone?(): void;
}

export type AfterDelay = (ms: number, run: () => void) => () => void;

/** How long the entries an overlay gives back may take to be stepped back over before the count of steps still owed is dropped, since a WebView may merge steps it is asked for in one task. */
export const GIVE_BACK_SETTLES_MS = 500;

const BROWSER_DELAY: AfterDelay = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => {
    clearTimeout(timer);
  };
};

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
  readonly #after: AfterDelay;
  #held: readonly HeldEntry[] = [];
  #following: BackFollower | undefined;
  #stepsOwed: readonly number[] = [];
  #releasedTogether = 0;
  #waiting: readonly (() => void)[] = [];
  #stopListening: (() => void) | undefined;
  #stopHealing: (() => void) | undefined;

  constructor(
    history: PageHistory,
    tell: () => void,
    isOn: () => boolean,
    after: AfterDelay = BROWSER_DELAY,
  ) {
    this.#history = history;
    this.#tell = tell;
    this.#isOn = isOn;
    this.#after = after;
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
    if (!this.#isGivingBack()) {
      this.#push(entry);
    }
    return () => {
      this.#release(entry);
    };
  }

  mustGiveBackBeforeLeaving(): boolean {
    return this.#isGivingBack() || this.willTakeBack();
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
    const giveable = this.#held.filter((entry) => isGiveable(entry));
    for (const entry of this.#held) {
      entry.isGivenBack = true;
    }
    this.#stepBack(giveable.length);
    return this.#isGivingBack()
      ? new Promise((settle) => {
          this.#waiting = [...this.#waiting, settle];
        })
      : Promise.resolve();
  }

  #isGivingBack(): boolean {
    return this.#stepsOwed.length > 0 || this.#releasedTogether > 0;
  }

  #stepBack(steps: number): void {
    if (steps === 0) {
      return;
    }
    this.#stepsOwed = [...this.#stepsOwed, steps];
    this.#history.back(steps);
    this.#healWhenNoStepArrives();
  }

  #healWhenNoStepArrives(): void {
    this.#stopHealing?.();
    this.#stopHealing = this.#after(GIVE_BACK_SETTLES_MS, () => {
      this.#stopHealing = undefined;
      this.#stepsOwed = [];
      this.#givingBackIsDone();
    });
  }

  #givingBackIsDone(): void {
    this.#pushWaiting();
    this.#settleWaiting();
    this.#stopWhenIdle();
  }

  #push(entry: HeldEntry): void {
    entry.isOnEntry = this.#history.push();
    entry.isPushed = true;
    this.#tell();
  }

  #backed(): void {
    if (this.#stepsOwed.length > 0) {
      this.#stepsOwed = this.#stepsOwed.slice(1);
      if (this.#stepsOwed.length === 0) {
        this.#stopHealing?.();
        this.#stopHealing = undefined;
        this.#givingBackIsDone();
      } else {
        this.#healWhenNoStepArrives();
        this.#stopWhenIdle();
      }
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
      entry.isGivenBack = true;
      this.#releasedTogether += 1;
      if (this.#releasedTogether === 1) {
        queueMicrotask(() => {
          const together = this.#releasedTogether;
          this.#releasedTogether = 0;
          this.#stepBack(together);
          if (!this.#isGivingBack()) {
            this.#givingBackIsDone();
          }
        });
      }
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
    if (this.#held.length === 0 && !this.#isGivingBack()) {
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
  back: (steps) => {
    history.go(-steps);
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

export interface PageNavigation {
  readonly type: "enter" | "form" | "leave" | "link" | "goto" | "popstate";
  readonly event?: Event | undefined;
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
  started?: StartedNavigation,
): boolean {
  const { from, to } = navigation;
  if (
    started?.isAcrossOverlays === true ||
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

export function optionsToCarry(
  navigation: PageNavigation,
  started: StartedNavigation | undefined,
): NavigationOptions | undefined {
  switch (navigation.type) {
    case "goto":
      return started?.options;
    case "link":
      return optionsOfLinkClick(navigation.event);
    case "enter":
    case "form":
    case "leave":
    case "popstate":
      return undefined;
    default:
      return assertNever(navigation.type);
  }
}

export const mustLeaveOverlays = (): boolean =>
  overlays.mustGiveBackBeforeLeaving();

export function giveBackOverlayEntriesBeforeLeavingPage(): void {
  beforeNavigate((navigation) => {
    const { to } = navigation;
    const started = to === null ? undefined : navigationStartedTo(to.url);
    if (
      to === null ||
      !mustLeaveOverlaysBefore(navigation, overlays, started)
    ) {
      return;
    }
    const carried = optionsToCarry(navigation, started);
    navigation.cancel();
    leaveOverlaysThen(() => navigateTo(resolvedPathOf(to.url), carried));
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

const OPEN_STATE_ATTRIBUTE = "data-state";

/** The UI library keeps an overlay mounted through its exit animation and flips `data-state` to `closed` when the closing starts. */
const isClosing = (element: HTMLElement): boolean =>
  element.getAttribute(OPEN_STATE_ATTRIBUTE) === "closed";

export function closesOnBackIn(
  overlays: OverlayBack,
  follower?: BackFollower,
): Attachment<HTMLElement> {
  return (element) => {
    let release: (() => void) | undefined;
    const holdWhileOpen = (): void => {
      release = overlays.hold(() => {
        closeLikeEscape(element);
        follower?.closed?.();
      }, follower);
    };
    const followOpenState = (): void => {
      if (isClosing(element)) {
        release?.();
        release = undefined;
      } else if (release === undefined) {
        holdWhileOpen();
      }
    };
    if (!isClosing(element)) {
      holdWhileOpen();
    }
    const watching = new MutationObserver(followOpenState);
    watching.observe(element, {
      attributes: true,
      attributeFilter: [OPEN_STATE_ATTRIBUTE],
    });
    return () => {
      watching.disconnect();
      release?.();
      follower?.gone?.();
    };
  };
}

export const closesOnBackFollowedBy = (
  follower: BackFollower,
): Attachment<HTMLElement> => closesOnBackIn(overlays, follower);

export const closesOnBack = closesOnBackIn(overlays);
