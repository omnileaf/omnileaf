/** Which way a row is swiped, along the reading direction: toward its end is right in left-to-right text. */
export type SwipeSide = "towardEnd" | "towardStart";

export type SwipeOutcome =
  | { readonly kind: "rest" }
  | { readonly kind: "reveal"; readonly side: SwipeSide }
  | { readonly kind: "act"; readonly side: SwipeSide };

const REVEAL_PX = 48;
const ACT_SHARE = 0.5;
const DRAG_SLOP_PX = 10;

export interface SwipeEnd {
  /** Pixels moved toward the row's inline end, negative toward its start. */
  readonly travel: number;
  readonly rowWidth: number;
}

export function swipeOutcome(
  swiped: SwipeEnd,
  canSwipe: (side: SwipeSide) => boolean,
): SwipeOutcome {
  const side: SwipeSide = swiped.travel > 0 ? "towardEnd" : "towardStart";
  const distance = Math.abs(swiped.travel);
  if (distance < REVEAL_PX || !canSwipe(side)) {
    return { kind: "rest" };
  }
  return distance >= swiped.rowWidth * ACT_SHARE
    ? { kind: "act", side }
    : { kind: "reveal", side };
}

export function isSidewaysDrag(across: number, down: number): boolean {
  return Math.abs(across) > DRAG_SLOP_PX && Math.abs(across) > Math.abs(down);
}

export function travelToward(
  movedRight: number,
  direction: "ltr" | "rtl",
): number {
  return direction === "rtl" ? -movedRight : movedRight;
}
