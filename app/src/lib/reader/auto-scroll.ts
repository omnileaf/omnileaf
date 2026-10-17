import type { AutoScrollChoice } from "./reader-settings.svelte.ts";

export interface AutoScrollSpeed {
  readonly pagesPerMinute: number;
  readonly isMyPace: boolean;
}

const SECONDS_IN_A_MINUTE = 60;
const MS_IN_A_MINUTE = 60_000;
export const SPEED_STEP = 0.5;
export const SLOWEST_SPEED = 0.5;
export const FASTEST_SPEED = 10;

export function autoScrollSpeed({
  choice,
  pagesPerMinute,
  secondsPerPage,
}: {
  choice: AutoScrollChoice;
  pagesPerMinute: number;
  secondsPerPage: number | null;
}): AutoScrollSpeed {
  return choice === "myPace" && secondsPerPage !== null && secondsPerPage > 0
    ? { pagesPerMinute: SECONDS_IN_A_MINUTE / secondsPerPage, isMyPace: true }
    : { pagesPerMinute, isMyPace: false };
}

export function pixelsScrolled(
  elapsedMs: number,
  pagesPerMinute: number,
  pageHeight: number,
): number {
  return (pageHeight * pagesPerMinute * elapsedMs) / MS_IN_A_MINUTE;
}

export function fasterSpeed(pagesPerMinute: number): number {
  return Math.min(FASTEST_SPEED, pagesPerMinute + SPEED_STEP);
}

export function slowerSpeed(pagesPerMinute: number): number {
  return Math.max(SLOWEST_SPEED, pagesPerMinute - SPEED_STEP);
}
