import { Channel } from "@tauri-apps/api/core";

import type { BackSwipe } from "#lib/ipc/bindings.ts";

import { watchBackSwipes } from "./back-swipe-allowance";

const SMALLEST_SCALE = 0.9;
const LARGEST_CORNER_PX = 28;

export interface BackPreviewLook {
  readonly scale: number;
  readonly cornerPx: number;
}

export function backPreviewLook(
  progress: number,
  isReducedMotion: boolean,
): BackPreviewLook {
  if (isReducedMotion) {
    return { scale: 1, cornerPx: 0 };
  }
  const reached = Math.min(1, Math.max(0, progress));
  return {
    scale: 1 - (1 - SMALLEST_SCALE) * reached,
    cornerPx: LARGEST_CORNER_PX * reached,
  };
}

export function previewBackGestures(
  show: (progress: number | undefined) => void,
): void {
  const gestures = new Channel<BackSwipe>((gesture) => {
    show(gesture.kind === "moved" ? (gesture.progress ?? 0) : undefined);
  });
  watchBackSwipes(gestures);
}
