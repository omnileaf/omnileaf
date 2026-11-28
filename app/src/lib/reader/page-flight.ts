import { durationMs } from "#lib/library/settle-row.ts";

export interface SlidePath {
  readonly from: number;
  readonly to: number;
}

export interface TurnsOnScreen {
  readonly low: number;
  readonly high: number;
}

const ONLY_THE_PAGE: TurnsOnScreen = { low: 0, high: 0 };
const SLIDE_DURATION = "--transition-duration-slide";
const SLIDE_EASINGS = {
  fromRest: "--ease-emphasized",
  inMotion: "--ease-out",
} as const satisfies Record<string, string>;

export type SlideStart = keyof typeof SLIDE_EASINGS;

export interface SlideTiming {
  readonly duration: number;
  readonly easing: string;
}

export function turnsOnScreen(
  path: SlidePath,
  width: number,
  nextSide: number,
): TurnsOnScreen {
  if (width <= 0) {
    return ONLY_THE_PAGE;
  }
  const nearest = Math.min(path.from, path.to) / width;
  const farthest = Math.max(path.from, path.to) / width;
  const leftmost = Math.floor(-1 - farthest) + 1;
  const rightmost = Math.ceil(1 - nearest) - 1;
  const ends = [leftmost * nextSide + 0, rightmost * nextSide + 0];
  return { low: Math.min(...ends), high: Math.max(...ends) };
}

export function slideTiming(element: Element, start: SlideStart): SlideTiming {
  const style = getComputedStyle(element);
  return {
    duration: durationMs(style.getPropertyValue(SLIDE_DURATION)),
    easing: style.getPropertyValue(SLIDE_EASINGS[start]).trim(),
  };
}
