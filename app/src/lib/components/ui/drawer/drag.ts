export type DragStart = "undecided" | "dragging" | "abandoned";

export interface PointerTravel {
  readonly x: number;
  readonly y: number;
}

export interface DragRelease {
  readonly offset: number;
  readonly sheetHeight: number;
  readonly elapsedMs: number;
}

const TOUCH_SLOP_PX = 10;
const POINTER_SLOP_PX = 2;
const RESISTANCE_PX = 8;
const RESISTANCE_FREE_PULL = 2;
const FLICK_PX_PER_MS = 0.4;
const CLOSING_SHARE = 0.25;

export function dragStartFrom(
  travel: PointerTravel,
  pointerType: string,
): DragStart {
  const slop = pointerType === "touch" ? TOUCH_SLOP_PX : POINTER_SLOP_PX;
  const across = Math.abs(travel.x);
  const along = Math.abs(travel.y);
  if (Math.max(across, along) <= slop) {
    return "undecided";
  }
  return along > across ? "dragging" : "abandoned";
}

function resisted(pull: number): number {
  return RESISTANCE_PX * (Math.log(pull + 1) - RESISTANCE_FREE_PULL);
}

/** The sheet follows a pull down one to one and resists a pull up, rising logarithmically. */
export function sheetOffset(dragged: number): number {
  if (dragged >= 0) {
    return dragged;
  }
  return Math.min(-resisted(-dragged), 0);
}

export function backdropOpacity(offset: number, sheetHeight: number): number {
  return Math.min(Math.max(1 - offset / sheetHeight, 0), 1);
}

export function isDismissed(release: DragRelease): boolean {
  if (release.offset <= 0) {
    return false;
  }
  if (release.offset / release.elapsedMs > FLICK_PX_PER_MS) {
    return true;
  }
  return release.offset >= release.sheetHeight * CLOSING_SHARE;
}
