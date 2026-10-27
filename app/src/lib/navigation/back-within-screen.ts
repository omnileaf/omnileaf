import type { BackSwipe } from "#lib/ipc/bindings.ts";

import { isGoingBack } from "./back-swipe";

interface OpenLayer {
  readonly close: () => void;
}

let openLayers: readonly OpenLayer[] = [];

export function isBackTakenByScreen(): boolean {
  const top = openLayers.at(-1);
  top?.close();
  return top !== undefined;
}

export function willScreenTakeBack(): boolean {
  return openLayers.length > 0;
}

export function takeBackWithinScreen(close: () => void): () => void {
  const layer: OpenLayer = { close };
  openLayers = [...openLayers, layer];
  return () => {
    openLayers = openLayers.filter((open) => open !== layer);
  };
}

export function unlessTakenByScreen(swipe: BackSwipe): BackSwipe {
  return swipe.kind === "released" &&
    isGoingBack(swipe.progress ?? 0, swipe.velocity ?? 0) &&
    isBackTakenByScreen()
    ? { kind: "cancelled" }
    : swipe;
}
