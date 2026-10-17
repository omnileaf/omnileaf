import type { TextDirection } from "#lib/navigation/back-swipe.ts";

const COMMITTING_SHARE = 0.25;
const FLICK_PX_PER_MS = 0.5;
const STARTING_PX = 8;
const SIDEWAYS_RATIO = 2;

export function isAcross({ x, y }: { x: number; y: number }): boolean {
  return (
    Math.abs(x) >= STARTING_PX && Math.abs(x) >= SIDEWAYS_RATIO * Math.abs(y)
  );
}

export function tabSwipedTo({
  moved,
  width,
  velocity,
  direction,
}: {
  moved: number;
  width: number;
  velocity: number;
  direction: TextDirection;
}): -1 | 0 | 1 {
  const isFar = Math.abs(moved) > width * COMMITTING_SHARE;
  const isFlick =
    Math.abs(velocity) > FLICK_PX_PER_MS &&
    Math.sign(velocity) === Math.sign(moved);
  if (moved === 0 || (!isFar && !isFlick)) {
    return 0;
  }
  const towardsStart = moved < 0;
  const isForward = direction === "ltr" ? towardsStart : !towardsStart;
  return isForward ? 1 : -1;
}

const EDGE_PX = 24;

interface SwipeStart {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  readonly pointer: number;
}

/** Leaves a touch that starts at the screen's edge to the system's own back gesture. */
function isAtEdge(x: number): boolean {
  return x < EDGE_PX || x > document.documentElement.clientWidth - EDGE_PX;
}

export function swipesBetweenTabs(
  onSwipe: (step: 1 | -1) => void,
): (area: HTMLElement) => () => void {
  return (area) => {
    let start: SwipeStart | undefined;
    let isSwiping = false;

    const reset = () => {
      area.style.translate = "";
      start = undefined;
      isSwiping = false;
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || isAtEdge(event.clientX)) {
        return;
      }
      start = {
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
        pointer: event.pointerId,
      };
    };
    const move = (event: PointerEvent) => {
      if (start?.pointer !== event.pointerId) {
        return;
      }
      const moved = { x: event.clientX - start.x, y: event.clientY - start.y };
      if (!isSwiping && !isAcross(moved)) {
        if (Math.abs(moved.y) > Math.abs(moved.x)) {
          reset();
        }
        return;
      }
      isSwiping = true;
      area.style.translate = `${String(moved.x)}px 0`;
    };
    const up = (event: PointerEvent) => {
      if (start?.pointer !== event.pointerId) {
        return;
      }
      const moved = event.clientX - start.x;
      const step = isSwiping
        ? tabSwipedTo({
            moved,
            width: area.clientWidth,
            velocity: moved / Math.max(event.timeStamp - start.at, 1),
            direction:
              getComputedStyle(area).direction === "rtl" ? "rtl" : "ltr",
          })
        : 0;
      reset();
      if (step !== 0) {
        onSwipe(step);
      }
    };

    area.addEventListener("pointerdown", down);
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerup", up);
    area.addEventListener("pointercancel", reset);
    return () => {
      area.removeEventListener("pointerdown", down);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerup", up);
      area.removeEventListener("pointercancel", reset);
      reset();
    };
  };
}
