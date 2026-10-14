import {
  isSidewaysDrag,
  type SwipeOutcome,
  type SwipeSide,
  swipeOutcome,
  travelToward,
} from "./swipe";

type Direction = "ltr" | "rtl";

interface Press {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly base: number;
  readonly direction: Direction;
  readonly width: number;
}

interface Revealed {
  readonly key: string;
  readonly side: SwipeSide;
  readonly offset: number;
}

const REVEALED_PX = 112;

function directionOf(row: HTMLElement): Direction {
  return getComputedStyle(row).direction === "rtl" ? "rtl" : "ltr";
}

function revealedOffset(side: SwipeSide, direction: Direction): number {
  return travelToward(
    side === "towardEnd" ? REVEALED_PX : -REVEALED_PX,
    direction,
  );
}

/** Follows one finger swiping one row of a list sideways, and the row left open on its action. */
export class RowSwipe {
  isDragging = $state(false);
  #movedRight = $state(0);
  #press: Press | undefined = $state();
  #revealed: Revealed | undefined = $state();
  #isClickSwallowed = false;

  constructor(private readonly canSwipe: (side: SwipeSide) => boolean) {}

  offsetOf(key: string): number {
    if (this.#press?.key === key && this.isDragging) {
      return this.#movedRight;
    }
    return this.#revealed?.key === key ? this.#revealed.offset : 0;
  }

  sideOf(key: string): SwipeSide | undefined {
    const press = this.#press;
    if (press?.key === key && this.isDragging && this.#movedRight !== 0) {
      return travelToward(this.#movedRight, press.direction) > 0
        ? "towardEnd"
        : "towardStart";
    }
    return this.#revealed?.key === key ? this.#revealed.side : undefined;
  }

  isRevealed(key: string): boolean {
    return this.#revealed?.key === key && !this.isDragging;
  }

  pressed(event: PointerEvent, key: string, row: HTMLElement): void {
    if (event.pointerType === "mouse") {
      return;
    }
    this.#press = {
      key,
      x: event.clientX,
      y: event.clientY,
      base: this.offsetOf(key),
      direction: directionOf(row),
      width: row.getBoundingClientRect().width,
    };
    this.#movedRight = this.#press.base;
  }

  /** Returns whether the press has become a sideways drag. */
  moved(event: PointerEvent): boolean {
    const press = this.#press;
    if (press === undefined) {
      return false;
    }
    const across = event.clientX - press.x;
    if (!this.isDragging && !isSidewaysDrag(across, event.clientY - press.y)) {
      return false;
    }
    this.isDragging = true;
    this.#movedRight = press.base + across;
    return true;
  }

  released(): SwipeOutcome {
    const press = this.#press;
    this.#press = undefined;
    if (press === undefined || !this.isDragging) {
      return { kind: "rest" };
    }
    this.isDragging = false;
    this.#isClickSwallowed = true;
    const outcome = swipeOutcome(
      {
        travel: travelToward(this.#movedRight, press.direction),
        rowWidth: press.width,
      },
      this.canSwipe,
    );
    this.#revealed =
      outcome.kind === "reveal"
        ? {
            key: press.key,
            side: outcome.side,
            offset: revealedOffset(outcome.side, press.direction),
          }
        : undefined;
    return outcome;
  }

  cancelled(): void {
    this.#press = undefined;
    this.isDragging = false;
  }

  close(): void {
    this.#revealed = undefined;
  }

  /** Swallows the click that ends a swipe, and the tap that closes an open row. */
  clicked(event: MouseEvent, key: string): void {
    const isClosingTap = this.#revealed?.key === key;
    if (this.#isClickSwallowed || isClosingTap) {
      this.#isClickSwallowed = false;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }
}
