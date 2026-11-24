import { assertNever } from "#lib/assert-never.ts";

import {
  ANDROID_BACK_MOTION,
  ANDROID_BACK_SPRING,
  type BackGestureAt,
  type BackGestureStep,
  type BackPreviewFrame,
  backPreviewFrame,
  leavingTarget,
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
    return this.#frameAt(this.#now);
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
