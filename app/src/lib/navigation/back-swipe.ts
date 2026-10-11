import type { SwipeEdge } from "#lib/ipc/bindings.ts";

export type TextDirection = "ltr" | "rtl";

export interface ScreenPlacement {
  readonly current: number;
  readonly previous: number;
  readonly dimming: number;
}

const PREVIOUS_SCREEN_OFFSET = 0.3;
const PREVIOUS_SCREEN_DIMMING = 0.12;
const HALFWAY = 0.5;
const FLICK_SCREEN_WIDTHS_PER_SECOND = 0.75;

const BACK_EDGES = {
  ltr: "left",
  rtl: "right",
} as const satisfies Record<TextDirection, SwipeEdge>;

export function backSwipeEdge(
  hasBackLink: boolean,
  direction: TextDirection,
): SwipeEdge | null {
  return hasBackLink ? BACK_EDGES[direction] : null;
}

export function placeScreens(
  progress: number,
  isMotionReduced: boolean,
): ScreenPlacement {
  const arrived = Math.min(Math.max(progress, 0), 1);
  const toGo = 1 - arrived;
  return {
    current: arrived,
    previous: isMotionReduced ? 0 : PREVIOUS_SCREEN_OFFSET * (arrived - 1),
    dimming: PREVIOUS_SCREEN_DIMMING * toGo,
  };
}

export function isGoingBack(progress: number, velocity: number): boolean {
  if (velocity > FLICK_SCREEN_WIDTHS_PER_SECOND) {
    return true;
  }
  return progress > HALFWAY && velocity > -FLICK_SCREEN_WIDTHS_PER_SECOND;
}
