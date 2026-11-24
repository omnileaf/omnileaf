import { Channel } from "@tauri-apps/api/core";

import { assertNever } from "#lib/assert-never.ts";
import type { BackSwipe, SwipeEdge } from "#lib/ipc/bindings.ts";

import { watchBackSwipes } from "./back-swipe-allowance";
import { cubicBezier } from "./cubic-bezier";

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
  enteringStartPx: -96,
  scrimLight: 0.2,
  scrimDark: 0.8,
  gestureCurve: cubicBezier(0.1, 0.1, 0, 1),
} as const;

const RESTING: PlacedScreen = { scale: 1, x: 0, y: 0 };

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
  const reach = Math.min(0.5, Math.abs(moved)) / 0.5;
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
    return { closing: RESTING, entering: RESTING, scrim: 0 };
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
    entering: { scale, x: ANDROID_BACK.enteringStartPx, y },
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
