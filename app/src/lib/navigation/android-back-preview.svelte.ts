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

export type PreviewPhase =
  "resting" | "following" | "cancelling" | "committing";

export interface LeavingScreen {
  readonly copy: ScreenCopy;
  readonly from: PlacedScreen;
  readonly to: PlacedScreen;
  readonly scrimOpacity: number;
}

interface PreviewLook {
  readonly isMotionReduced: () => boolean;
}

export class AndroidBackPreview {
  phase: PreviewPhase = $state("resting");
  area: ScreenArea | undefined = $state();
  #start: BackGestureAt | undefined = $state();
  #now: BackGestureAt | undefined = $state();
  enteringFrom: PlacedScreen | undefined = $state();
  leaving: LeavingScreen | undefined = $state();
  hasLeft = $state(false);
  #isEnteringSettled = $state(false);
  readonly #look: PreviewLook;
  #settled: ReturnType<typeof setTimeout> | undefined;
  #nextFrames: readonly number[] = [];
  #gesturesStarted = 0;
  #gesturesBeforeNavigating = 0;

  constructor(look: PreviewLook) {
    this.#look = look;
  }

  get cornerPx(): number {
    return this.#look.isMotionReduced() ? 0 : (this.#now?.cornerPx ?? 0);
  }

  get frame(): BackPreviewFrame | undefined {
    return this.#frameAt(this.#now);
  }

  get mainTransform(): string | undefined {
    switch (this.phase) {
      case "following":
        return this.frame === undefined
          ? undefined
          : placedTransform(this.frame.closing);
      case "cancelling":
        return placedTransform(RESTING_SCREEN);
      case "committing":
        return placedTransform(
          this.#isEnteringSettled
            ? RESTING_SCREEN
            : (this.enteringFrom ?? RESTING_SCREEN),
        );
      case "resting":
        return undefined;
      default:
        return assertNever(this.phase);
    }
  }

  get mainTransition(): string | undefined {
    switch (this.phase) {
      case "cancelling":
        return ANDROID_BACK_TRANSITIONS.springBack;
      case "committing":
        return this.#isEnteringSettled
          ? ANDROID_BACK_TRANSITIONS.entering
          : undefined;
      case "following":
      case "resting":
        return undefined;
      default:
        return assertNever(this.phase);
    }
  }

  get restingFrame(): BackPreviewFrame | undefined {
    return this.#frameAt(this.#start);
  }

  #frameAt(now: BackGestureAt | undefined): BackPreviewFrame | undefined {
    if (
      this.#start === undefined ||
      now === undefined ||
      this.area === undefined
    ) {
      return undefined;
    }
    return backPreviewFrame(
      this.#start,
      now,
      { width: this.area.width, height: this.area.height },
      this.#look.isMotionReduced(),
    );
  }

  follow(step: BackGestureStep, screen: HTMLElement): void {
    switch (step.kind) {
      case "started":
        this.#begin(step.at, screen);
        return;
      case "moved":
        if (this.phase === "following") {
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

  #begin(at: BackGestureAt, screen: HTMLElement): void {
    this.#gesturesStarted += 1;
    this.#clearSettling();
    this.area ??= screen.getBoundingClientRect();
    this.leaving = undefined;
    this.enteringFrom = undefined;
    this.#start = at;
    this.#now = at;
    this.phase = "following";
  }

  navigating(): void {
    this.#gesturesBeforeNavigating = this.#gesturesStarted;
  }

  leave(copy: ScreenCopy): void {
    this.navigating();
    const frame = this.frame;
    if (
      this.phase !== "following" ||
      frame === undefined ||
      this.area === undefined
    ) {
      return;
    }
    this.leaving = {
      copy,
      from: frame.closing,
      to: this.#look.isMotionReduced()
        ? frame.closing
        : leavingTarget(frame.closing, this.area.width),
      scrimOpacity: frame.scrimOpacity,
    };
    this.enteringFrom = frame.entering;
    this.phase = "committing";
    this.#isEnteringSettled = false;
    this.hasLeft = false;
    this.#onNextFrame(() => {
      this.hasLeft = true;
    });
    this.#settleAfter(ANDROID_BACK_MOTION.commitMs);
  }

  stayed(): void {
    this.#cancel();
  }

  arrived(): void {
    if (this.#gesturesStarted !== this.#gesturesBeforeNavigating) {
      return;
    }
    if (this.phase === "following") {
      this.#rest();
      return;
    }
    if (this.phase === "committing") {
      this.#onNextFrame(() => {
        this.#isEnteringSettled = true;
      });
    }
  }

  #onNextFrame(run: () => void): void {
    const frame = requestAnimationFrame(() => {
      this.#nextFrames = this.#nextFrames.filter(
        (pending) => pending !== frame,
      );
      run();
    });
    this.#nextFrames = [...this.#nextFrames, frame];
  }

  #cancelNextFrames(): void {
    for (const frame of this.#nextFrames) {
      cancelAnimationFrame(frame);
    }
    this.#nextFrames = [];
  }

  #cancel(): void {
    if (this.phase !== "following") {
      return;
    }
    this.phase = "cancelling";
    this.#settleAfter(ANDROID_BACK_SPRING.durationMs);
  }

  #settleAfter(ms: number): void {
    this.#clearSettling();
    this.#settled = setTimeout(() => {
      this.#rest();
    }, ms);
  }

  #clearSettling(): void {
    clearTimeout(this.#settled);
    this.#settled = undefined;
  }

  #rest(): void {
    this.#clearSettling();
    this.#cancelNextFrames();
    this.hasLeft = false;
    this.#isEnteringSettled = false;
    this.phase = "resting";
    this.#start = undefined;
    this.#now = undefined;
    this.leaving = undefined;
    this.enteringFrom = undefined;
    this.area = undefined;
  }
}
