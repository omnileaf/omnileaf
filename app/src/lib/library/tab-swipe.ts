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

function textDirectionOf(area: HTMLElement): TextDirection {
  return getComputedStyle(area).direction === "rtl" ? "rtl" : "ltr";
}

function stepOf(moved: number, direction: TextDirection): 1 | -1 {
  const towardsStart = moved < 0;
  return (direction === "ltr") === towardsStart ? 1 : -1;
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
  return stepOf(moved, direction);
}

export function settlesAt({
  moved,
  width,
  step,
}: {
  moved: number;
  width: number;
  step: -1 | 0 | 1;
}): number {
  return step === 0 ? 0 : Math.sign(moved) * width;
}

const EDGE_PX = 24;
const SETTLE_MS = 200;

interface SwipeStart {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  readonly pointer: number;
  readonly direction: TextDirection;
}

/** Leaves a touch that starts at the screen's edge to the system's own back gesture. */
function isAtEdge(x: number): boolean {
  return x < EDGE_PX || x > document.documentElement.clientWidth - EDGE_PX;
}

export function swipesBetweenTabs(
  onSwipe: (step: 1 | -1) => void,
  canStep: (step: 1 | -1) => boolean,
  settlesSmoothly: () => boolean = () => false,
): (area: HTMLElement) => () => void {
  return (area) => {
    let start: SwipeStart | undefined;
    let isSwiping = false;
    let isSettling = false;
    let settling: Animation | undefined;

    const reset = () => {
      settling?.cancel();
      settling = undefined;
      area.style.translate = "";
      start = undefined;
      isSwiping = false;
      isSettling = false;
    };
    const settle = (from: number, to: number): Promise<boolean> => {
      isSettling = true;
      start = undefined;
      const toOffset = `${String(to)}px 0`;
      settling = area.animate(
        [{ translate: `${String(from)}px 0` }, { translate: toOffset }],
        { duration: SETTLE_MS, easing: "ease-out" },
      );
      area.style.translate = toOffset;
      return settling.finished.then(
        () => true,
        () => false,
      );
    };
    const down = (event: PointerEvent) => {
      if (
        isSettling ||
        event.pointerType !== "touch" ||
        isAtEdge(event.clientX)
      ) {
        return;
      }
      start = {
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
        pointer: event.pointerId,
        direction: textDirectionOf(area),
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
      const isHeld = !canStep(stepOf(moved.x, start.direction));
      area.style.translate = isHeld ? "" : `${String(moved.x)}px 0`;
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
            direction: start.direction,
          })
        : 0;
      const committed = step !== 0 && canStep(step) ? step : 0;
      const finish = () => {
        reset();
        if (committed !== 0) {
          onSwipe(committed);
        }
      };
      if (!isSwiping || !settlesSmoothly()) {
        finish();
        return;
      }
      const width = area.clientWidth;
      void settle(moved, settlesAt({ moved, width, step: committed })).then(
        (isFinished) => {
          if (isFinished) {
            finish();
          }
        },
      );
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
