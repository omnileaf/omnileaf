import { assertNever } from "#lib/assert-never.ts";

import {
  type AutoScrollChoice,
  SCREENS_PER_MINUTE,
} from "./reader-settings.svelte.ts";

export type AutoScrollSpeed =
  | { readonly kind: "myPace"; readonly pagesPerMinute: number }
  | { readonly kind: "set"; readonly screensPerMinute: number };

export interface StripHeights {
  readonly page: number;
  readonly screen: number;
}

const SECONDS_IN_A_MINUTE = 60;
const MS_IN_A_MINUTE = 60_000;

export function autoScrollSpeed({
  choice,
  screensPerMinute,
  secondsPerPage,
}: {
  choice: AutoScrollChoice;
  screensPerMinute: number;
  secondsPerPage: number | null;
}): AutoScrollSpeed {
  return choice === "myPace" && secondsPerPage !== null && secondsPerPage > 0
    ? { kind: "myPace", pagesPerMinute: SECONDS_IN_A_MINUTE / secondsPerPage }
    : { kind: "set", screensPerMinute };
}

function pixelsPerMinute(
  speed: AutoScrollSpeed,
  heights: StripHeights,
): number {
  switch (speed.kind) {
    case "myPace":
      return heights.page * speed.pagesPerMinute;
    case "set":
      return heights.screen * speed.screensPerMinute;
    default:
      return assertNever(speed);
  }
}

export function pixelsScrolled(
  elapsedMs: number,
  speed: AutoScrollSpeed,
  heights: StripHeights,
): number {
  return (pixelsPerMinute(speed, heights) * elapsedMs) / MS_IN_A_MINUTE;
}

export function fasterSpeed(screensPerMinute: number): number {
  return Math.min(
    SCREENS_PER_MINUTE.fastest,
    screensPerMinute + SCREENS_PER_MINUTE.step,
  );
}

export function slowerSpeed(screensPerMinute: number): number {
  return Math.max(
    SCREENS_PER_MINUTE.slowest,
    screensPerMinute - SCREENS_PER_MINUTE.step,
  );
}
