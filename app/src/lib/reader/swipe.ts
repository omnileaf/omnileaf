export type SwipeTurn = "next" | "previous";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Tells a horizontal swipe across a page from a tap or a mostly vertical drag, and swallows the click a swipe ends with. */
export class Swipe {
  #start: Point | undefined;
  #isClickSwallowed = false;

  constructor(private readonly minDistancePx: number) {}

  started(event: PointerEvent): void {
    this.#start = { x: event.clientX, y: event.clientY };
    this.#isClickSwallowed = false;
  }

  /** The turn a book read left to right takes for the swipe that just ended, or nothing for a tap or a drag that isn't one. */
  ended(event: PointerEvent): SwipeTurn | undefined {
    const start = this.#start;
    this.#start = undefined;
    if (start === undefined) {
      return undefined;
    }
    const across = event.clientX - start.x;
    const down = event.clientY - start.y;
    if (
      Math.abs(across) < this.minDistancePx ||
      Math.abs(across) <= Math.abs(down)
    ) {
      return undefined;
    }
    this.#isClickSwallowed = true;
    return across < 0 ? "next" : "previous";
  }

  cancelled(): void {
    this.#start = undefined;
    this.#isClickSwallowed = false;
  }

  /** Whether the click about to be handled ends a swipe, which then turns no page of its own. */
  isClickASwipe(): boolean {
    const isSwipe = this.#isClickSwallowed;
    this.#isClickSwallowed = false;
    return isSwipe;
  }
}
