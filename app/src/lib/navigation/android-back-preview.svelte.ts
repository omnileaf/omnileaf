import {
  type BackGestureAt,
  type BackPreviewFrame,
  backPreviewFrame,
  type PlacedScreen,
} from "./back-preview";
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

/** Android's post-commit and cancel motion: `DefaultCrossActivityBackAnimation.POST_COMMIT_DURATION` and the closing alpha `1 - progress * 5`, and `BackProgressAnimator`'s medium-stiffness, unbouncy spring back. */
export const ANDROID_BACK_MOTION = {
  commitMs: 450,
  leavingFadeMs: 90,
  cancelMs: 150,
} as const;

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

  follow(gesture: BackGestureAt | undefined, screen: HTMLElement): void {
    if (gesture === undefined) {
      this.#cancel();
      return;
    }
    if (this.phase !== "following") {
      this.#clearSettling();
      this.area = screen.getBoundingClientRect();
      this.#start = gesture;
      this.phase = "following";
    }
    this.#now = gesture;
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
      to: leavingTarget(frame.closing, this.area.width),
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
    this.#settleAfter(ANDROID_BACK_MOTION.cancelMs);
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
