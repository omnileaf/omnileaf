import { Channel } from "@tauri-apps/api/core";

import { assertNever } from "#lib/assert-never.ts";
import type { BackSwipe, SwipeEdge } from "#lib/ipc/bindings.ts";

import { watchBackSwipes } from "./back-swipe-allowance";
import { settlingOf } from "./back-spring";
import { cssLinearEasing } from "./css-easing";
import { cubicBezier, cubicPath } from "./cubic-bezier";

export interface BackGestureAt {
  readonly progress: number;
  readonly edge: SwipeEdge | null;
  readonly touchY: number;
  readonly cornerPx: number;
}

export interface PreviewScreen {
  readonly width: number;
  readonly height: number;
  readonly isDark: boolean;
}

export interface PlacedScreen {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface BackPreviewFrame {
  readonly closing: PlacedScreen;
  readonly entering: PlacedScreen;
  readonly scrim: number;
}

/** Android's cross-activity back animation: `CrossActivityBackAnimation` and `DefaultCrossActivityBackAnimation` in AOSP's WindowManager Shell. */
const ANDROID_BACK = {
  smallestScale: 0.9,
  edgeMarginPx: 8,
  enteringOffsetPx: 96,
  scrimLight: 0.2,
  scrimDark: 0.8,
  gestureCurve: cubicBezier(0.1, 0.1, 0, 1),
} as const;

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

/** Android springs a cancelled gesture's progress back to rest with a medium-stiffness, unbouncy spring that stops within 0.75% of rest (`BackProgressAnimator`). */
export const ANDROID_BACK_SPRING = settlingOf({
  stiffness: 1500,
  restingWithin: 0.75 / 100,
});

const COMMIT_TRANSFORM = `transform ${String(ANDROID_BACK_MOTION.commitMs)}ms ${ANDROID_BACK_MOTION.commitEasing}`;

export const ANDROID_BACK_TRANSITIONS = {
  springBack: `transform ${String(ANDROID_BACK_SPRING.durationMs)}ms ${ANDROID_BACK_SPRING.easing}`,
  entering: COMMIT_TRANSFORM,
  leaving: `${COMMIT_TRANSFORM}, opacity ${String(ANDROID_BACK_MOTION.leavingFadeMs)}ms linear`,
  leavingScrim: `opacity ${String(ANDROID_BACK_MOTION.commitMs)}ms linear`,
} as const;

export const RESTING_SCREEN: PlacedScreen = { scale: 1, x: 0, y: 0 };

export function placedTransform({ scale, x, y }: PlacedScreen): string {
  return `translate(${String(x)}px, ${String(y)}px) scale(${String(scale)})`;
}

export function leavingTarget(
  closing: PlacedScreen,
  width: number,
): PlacedScreen {
  const left = closing.x + (width - width * closing.scale) / 2;
  return { scale: 1, x: left + ANDROID_BACK.enteringOffsetPx, y: 0 };
}

/** Android reads at most half the screen's height of the finger's travel up or down (`CrossActivityBackAnimation.getYOffset`). */
const FINGER_REACH_OF_SCREEN = 0.5;

function decelerate(ratio: number): number {
  return 1 - (1 - ratio) * (1 - ratio);
}

function clampedProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

function sidewaysShift(
  edge: SwipeEdge | null,
  scale: number,
  width: number,
): number {
  if (edge === "right") {
    return 0;
  }
  return (width - width * scale) / 2 - ANDROID_BACK.edgeMarginPx;
}

function verticalShift(
  start: BackGestureAt,
  now: BackGestureAt,
  scale: number,
  height: number,
): number {
  const moved = now.touchY - start.touchY;
  const reach =
    Math.min(FINGER_REACH_OF_SCREEN, Math.abs(moved)) / FINGER_REACH_OF_SCREEN;
  const room = Math.max(
    0,
    (height - height * scale) / 2 - ANDROID_BACK.edgeMarginPx,
  );
  return room * decelerate(reach) * Math.sign(moved);
}

export function backPreviewFrame(
  start: BackGestureAt,
  now: BackGestureAt,
  screen: PreviewScreen,
  isReducedMotion: boolean,
): BackPreviewFrame {
  if (isReducedMotion) {
    return { closing: RESTING_SCREEN, entering: RESTING_SCREEN, scrim: 0 };
  }
  const eased = ANDROID_BACK.gestureCurve(clampedProgress(now.progress));
  const scale = 1 - (1 - ANDROID_BACK.smallestScale) * eased;
  const sideways = sidewaysShift(
    now.edge,
    ANDROID_BACK.smallestScale,
    screen.width,
  );
  const y = verticalShift(start, now, scale, screen.height);
  return {
    closing: { scale, x: sideways * eased, y },
    entering: { scale, x: -ANDROID_BACK.enteringOffsetPx, y },
    scrim: screen.isDark ? ANDROID_BACK.scrimDark : ANDROID_BACK.scrimLight,
  };
}

const MIDDLE_OF_THE_SCREEN = 0.5;
const SQUARE_CORNER_PX = 0;

export type BackGestureStep =
  | { readonly kind: "started"; readonly at: BackGestureAt }
  | { readonly kind: "moved"; readonly at: BackGestureAt }
  | { readonly kind: "ended" };

const ENDED: BackGestureStep = { kind: "ended" };

function positionOf(
  swipe: Extract<BackSwipe, { kind: "started" | "moved" }>,
): BackGestureAt {
  return {
    progress: swipe.progress ?? 0,
    edge: swipe.edge ?? null,
    touchY: swipe.touchY ?? MIDDLE_OF_THE_SCREEN,
    cornerPx: swipe.corner ?? SQUARE_CORNER_PX,
  };
}

function stepOf(swipe: BackSwipe): BackGestureStep {
  switch (swipe.kind) {
    case "started":
    case "moved":
      return { kind: swipe.kind, at: positionOf(swipe) };
    case "released":
    case "cancelled":
      return ENDED;
    default:
      return assertNever(swipe);
  }
}

export function previewBackGestures(
  follow: (step: BackGestureStep) => void,
  isScreenKept: () => boolean,
): () => void {
  watchBackSwipes(
    new Channel<BackSwipe>((swipe) => {
      follow(stepOf(swipe));
    }),
  );
  const endPreview = () => {
    if (isScreenKept()) {
      follow(ENDED);
    }
  };
  addEventListener("popstate", endPreview);
  return () => {
    removeEventListener("popstate", endPreview);
  };
}
