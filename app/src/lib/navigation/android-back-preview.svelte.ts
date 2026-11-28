import { assertNever } from "#lib/assert-never.ts";

import {
  ANDROID_BACK_MOTION,
  ANDROID_BACK_SPRING,
  ANDROID_BACK_TRANSITIONS,
  type BackGestureAt,
  type BackGestureStep,
  type BackPreviewFrame,
  backPreviewFrame,
  leavingTarget,
  type PlacedScreen,
  placedTransform,
  RESTING_SCREEN,
} from "./back-preview";
import type { ScreenArea, ScreenCopy } from "./previous-screens";

interface Commit {
  readonly copy: ScreenCopy;
  readonly from: PlacedScreen;
  readonly to: PlacedScreen;
  readonly enteringFrom: PlacedScreen;
  readonly scrimOpacity: number;
  readonly isPlaying: boolean;
}

type Motion =
  | { readonly kind: "resting" }
  | { readonly kind: "following" }
  | { readonly kind: "cancelling" }
  | { readonly kind: "committing"; readonly commit: Commit };

interface PreviewContext {
  readonly isMotionReduced: () => boolean;
  readonly pageBehind: () => ScreenCopy | undefined;
}

export interface PreviewScheduler {
  readonly after: (ms: number, run: () => void) => () => void;
  readonly nextFrame: (run: () => void) => () => void;
}

export const BROWSER_SCHEDULER: PreviewScheduler = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
  nextFrame: (run) => {
    const frame = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(frame);
    };
  },
};

const RESTING: Motion = { kind: "resting" };
const FOLLOWING: Motion = { kind: "following" };
const CANCELLING: Motion = { kind: "cancelling" };

export class AndroidBackPreview {
  #motion: Motion = $state(RESTING);
  #area: ScreenArea | undefined = $state();
  #behind: ScreenCopy | undefined = $state.raw();
  #start: BackGestureAt | undefined = $state();
  #now: BackGestureAt | undefined = $state();
  readonly #look: PreviewContext;
  readonly #scheduler: PreviewScheduler;
  #stopSettling: (() => void) | undefined;
  #pendingFrames: readonly (() => void)[] = [];
  #gesturesStarted = 0;
  #gesturesBeforeNavigating: number | undefined;

  constructor(
    look: PreviewContext,
    scheduler: PreviewScheduler = BROWSER_SCHEDULER,
  ) {
    this.#look = look;
    this.#scheduler = scheduler;
  }

  get phase(): Motion["kind"] {
    return this.#motion.kind;
  }

  get area(): ScreenArea | undefined {
    return this.#area;
  }

  get behind(): ScreenCopy | undefined {
    return this.#behind;
  }

  get commit(): Commit | undefined {
    return this.#motion.kind === "committing" ? this.#motion.commit : undefined;
  }

  get cornerPx(): number {
    return this.#look.isMotionReduced() ? 0 : (this.#now?.cornerPx ?? 0);
  }

  get frame(): BackPreviewFrame | undefined {
    return this.#frameAt(this.#now);
  }

  get restingFrame(): BackPreviewFrame | undefined {
    return this.#frameAt(this.#start);
  }

  get mainTransform(): string | undefined {
    const motion = this.#motion;
    switch (motion.kind) {
      case "following":
        return this.frame === undefined
          ? undefined
          : placedTransform(this.frame.closing);
      case "cancelling":
        return placedTransform(RESTING_SCREEN);
      case "committing":
        return placedTransform(
          motion.commit.isPlaying ? RESTING_SCREEN : motion.commit.enteringFrom,
        );
      case "resting":
        return undefined;
      default:
        return assertNever(motion);
    }
  }

  get mainTransition(): string | undefined {
    const motion = this.#motion;
    switch (motion.kind) {
      case "cancelling":
        return ANDROID_BACK_TRANSITIONS.springBack;
      case "committing":
        return motion.commit.isPlaying
          ? ANDROID_BACK_TRANSITIONS.entering
          : undefined;
      case "following":
      case "resting":
        return undefined;
      default:
        return assertNever(motion);
    }
  }

  #frameAt(now: BackGestureAt | undefined): BackPreviewFrame | undefined {
    if (
      this.#start === undefined ||
      now === undefined ||
      this.#area === undefined
    ) {
      return undefined;
    }
    return backPreviewFrame(
      this.#start,
      now,
      { width: this.#area.width, height: this.#area.height },
      this.#look.isMotionReduced(),
    );
  }

  follow(step: BackGestureStep, screen: HTMLElement): void {
    switch (step.kind) {
      case "started":
        this.#begin(step.at, screen);
        return;
      case "moved":
        if (this.#motion.kind === "following") {
          this.#now = step.at;
        }
        return;
      case "ended":
        this.#cancel();
        return;
      default:
        assertNever(step);
    }
  }

  navigationStarted(): void {
    this.#gesturesBeforeNavigating = this.#gesturesStarted;
  }

  navigationGoesAhead(leaving: ScreenCopy | undefined): void {
    this.#gesturesBeforeNavigating ??= this.#gesturesStarted;
    if (leaving !== undefined && this.#isGestureFromBeforeNavigating()) {
      this.#leave(leaving);
    }
  }

  navigationStopped(): void {
    const isOwnGesture = this.#isGestureFromBeforeNavigating();
    this.#gesturesBeforeNavigating = undefined;
    if (!isOwnGesture) {
      return;
    }
    if (this.#motion.kind === "committing") {
      this.#rest();
      return;
    }
    this.#cancel();
  }

  navigationArrived(): void {
    const isOwnGesture = this.#isGestureFromBeforeNavigating();
    this.#gesturesBeforeNavigating = undefined;
    if (!isOwnGesture) {
      return;
    }
    if (this.#motion.kind === "following") {
      this.#rest();
      return;
    }
    if (this.#motion.kind === "committing") {
      this.#onNextFrame(() => {
        this.#playCommit();
      });
    }
  }

  #isGestureFromBeforeNavigating(): boolean {
    return this.#gesturesBeforeNavigating === this.#gesturesStarted;
  }

  #begin(at: BackGestureAt, screen: HTMLElement): void {
    this.#gesturesStarted += 1;
    this.#stopTimers();
    this.#area ??= screen.getBoundingClientRect();
    this.#behind = this.#look.pageBehind();
    this.#start = at;
    this.#now = at;
    this.#motion = FOLLOWING;
  }

  #leave(copy: ScreenCopy): void {
    const frame = this.frame;
    if (
      this.#motion.kind !== "following" ||
      frame === undefined ||
      this.#area === undefined
    ) {
      return;
    }
    this.#motion = {
      kind: "committing",
      commit: {
        copy,
        from: frame.closing,
        to: this.#look.isMotionReduced()
          ? frame.closing
          : leavingTarget(frame.closing, this.#area.width),
        enteringFrom: frame.entering,
        scrimOpacity: frame.scrimOpacity,
        isPlaying: false,
      },
    };
  }

  #playCommit(): void {
    const motion = this.#motion;
    if (motion.kind !== "committing") {
      return;
    }
    this.#motion = {
      kind: "committing",
      commit: { ...motion.commit, isPlaying: true },
    };
    this.#settleAfter(ANDROID_BACK_MOTION.commitMs);
  }

  #cancel(): void {
    if (this.#motion.kind !== "following") {
      return;
    }
    this.#motion = CANCELLING;
    this.#settleAfter(ANDROID_BACK_SPRING.durationMs);
  }

  #onNextFrame(run: () => void): void {
    const cancel = this.#scheduler.nextFrame(() => {
      this.#pendingFrames = this.#pendingFrames.filter(
        (pending) => pending !== cancel,
      );
      run();
    });
    this.#pendingFrames = [...this.#pendingFrames, cancel];
  }

  #settleAfter(ms: number): void {
    this.#stopSettling?.();
    this.#stopSettling = this.#scheduler.after(ms, () => {
      this.#rest();
    });
  }

  #stopTimers(): void {
    this.#stopSettling?.();
    this.#stopSettling = undefined;
    for (const cancel of this.#pendingFrames) {
      cancel();
    }
    this.#pendingFrames = [];
  }

  #rest(): void {
    this.#stopTimers();
    this.#motion = RESTING;
    this.#start = undefined;
    this.#now = undefined;
    this.#area = undefined;
    this.#behind = undefined;
  }
}
