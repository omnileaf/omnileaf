import { assertNever } from "#lib/assert-never.ts";

import {
  type BackGestureAt,
  type BackGestureStep,
  type BackPreviewFrame,
  backPreviewFrame,
  type PlacedScreen,
} from "./back-preview";
import { settlingOf } from "./back-spring";
import { cssLinearEasing } from "./css-easing";
import { cubicPath } from "./cubic-bezier";
import type { ScreenCopy } from "./previous-screens";

export type PreviewPhase =
  "resting" | "following" | "cancelling" | "committing";

export interface PreviewArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LeavingScreen {
  readonly copy: ScreenCopy;
  readonly from: PlacedScreen;
  readonly to: PlacedScreen;
  readonly scrim: number;
}

interface PreviewLook {
  readonly isDark: () => boolean;
  readonly isMotionReduced: () => boolean;
}

const EMPHASIZED_STOPS = 64;

/** WindowManager Shell's `Interpolators.EMPHASIZED`, the two-segment `fast_out_extra_slow_in` path. */
const ANDROID_EMPHASIZED = cubicPath([
  {
    control1: { x: 0.05, y: 0 },
    control2: { x: 0.133333, y: 0.06 },
    to: { x: 0.166666, y: 0.4 },
  },
  {
    control1: { x: 0.208333, y: 0.82 },
    control2: { x: 0.25, y: 1 },
    to: { x: 1, y: 1 },
  },
]);

/** Android's post-commit motion: `DefaultCrossActivityBackAnimation.POST_COMMIT_DURATION` on its emphasized curve, and the closing alpha `1 - progress * 5`. */
export const ANDROID_BACK_MOTION = {
  commitMs: 450,
  commitEasing: cssLinearEasing(ANDROID_EMPHASIZED, EMPHASIZED_STOPS),
  leavingFadeMs: 90,
} as const;

/** `BackProgressAnimator` springs a cancelled gesture's progress back with `SpringForce.STIFFNESS_MEDIUM` and `DAMPING_RATIO_NO_BOUNCY`, stopping within `MIN_VISIBLE_CHANGE_PIXELS * THRESHOLD_MULTIPLIER` of its progress scaled by `SCALE_FACTOR`. */
export const ANDROID_BACK_SPRING = settlingOf({
  stiffness: 1500,
  restingWithin: 0.75 / 100,
});

const AFTER_ENTERING_SHIFT_PX = 96;

export const RESTING_SCREEN: PlacedScreen = { scale: 1, x: 0, y: 0 };

export function placedTransform({ scale, x, y }: PlacedScreen): string {
  return `translate(${String(x)}px, ${String(y)}px) scale(${String(scale)})`;
}

export function leavingTarget(
  closing: PlacedScreen,
  width: number,
): PlacedScreen {
  const left = closing.x + (width - width * closing.scale) / 2;
  return { scale: 1, x: left + AFTER_ENTERING_SHIFT_PX, y: 0 };
}

export class AndroidBackPreview {
  phase: PreviewPhase = $state("resting");
  area: PreviewArea | undefined = $state();
  #start: BackGestureAt | undefined = $state();
  #now: BackGestureAt | undefined = $state();
  enteringFrom: PlacedScreen | undefined = $state();
  leaving: LeavingScreen | undefined = $state();
  readonly #look: PreviewLook;
  #settled: ReturnType<typeof setTimeout> | undefined;

  constructor(look: PreviewLook) {
    this.#look = look;
  }

  get cornerPx(): number {
    return this.#look.isMotionReduced() ? 0 : (this.#now?.cornerPx ?? 0);
  }

  get frame(): BackPreviewFrame | undefined {
    if (
      this.#start === undefined ||
      this.#now === undefined ||
      this.area === undefined
    ) {
      return undefined;
    }
    return backPreviewFrame(
      this.#start,
      this.#now,
      {
        width: this.area.width,
        height: this.area.height,
        isDark: this.#look.isDark(),
      },
      this.#look.isMotionReduced(),
    );
  }

  get restingFrame(): BackPreviewFrame | undefined {
    if (this.#start === undefined || this.area === undefined) {
      return undefined;
    }
    return backPreviewFrame(
      this.#start,
      this.#start,
      {
        width: this.area.width,
        height: this.area.height,
        isDark: this.#look.isDark(),
      },
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
    this.#clearSettling();
    this.area ??= screen.getBoundingClientRect();
    this.leaving = undefined;
    this.enteringFrom = undefined;
    this.#start = at;
    this.#now = at;
    this.phase = "following";
  }

  leave(copy: ScreenCopy): void {
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
      scrim: frame.scrim,
    };
    this.enteringFrom = frame.entering;
    this.phase = "committing";
    this.#settleAfter(ANDROID_BACK_MOTION.commitMs);
  }

  arrived(): void {
    if (this.phase === "following") {
      this.#rest();
    }
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
    this.phase = "resting";
    this.#start = undefined;
    this.#now = undefined;
    this.leaving = undefined;
    this.enteringFrom = undefined;
    this.area = undefined;
  }
}
