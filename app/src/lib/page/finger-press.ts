import { TOUCH_SLOP_PX } from "#lib/components/ui/drawer/drag.ts";

export const FINGER_PRESS_DELAY_MS = 100;
export const SHORTEST_PRESS_SHOWN_MS = 150;

const PRESSED = "data-pressed";
const PRESSABLE = 'button:not(:disabled):not([aria-disabled="true"])';

interface FingerOnControl {
  readonly control: Element;
  readonly x: number;
  readonly y: number;
  readonly marking: ReturnType<typeof setTimeout>;
  isMarked: boolean;
}

function movedPastSlop(finger: FingerOnControl, event: PointerEvent): boolean {
  return (
    Math.hypot(event.clientX - finger.x, event.clientY - finger.y) >
    TOUCH_SLOP_PX
  );
}

/** Chromium given touches through DevTools never set `:active` on a button under a resting finger, so the press is marked by hand. */
export function markFingerPresses(root: Document): () => void {
  const fingers = new Map<number, FingerOnControl>();

  const isHeldByAnother = (control: Element): boolean =>
    [...fingers.values()].some(
      (finger) => finger.control === control && finger.isMarked,
    );

  const unmark = (control: Element): void => {
    if (!isHeldByAnother(control)) {
      control.removeAttribute(PRESSED);
    }
  };

  const forget = (pointerId: number): FingerOnControl | undefined => {
    const finger = fingers.get(pointerId);
    if (finger !== undefined) {
      clearTimeout(finger.marking);
      fingers.delete(pointerId);
    }
    return finger;
  };

  const press = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !(event.target instanceof Element)) {
      return;
    }
    const control = event.target.closest(PRESSABLE);
    if (control === null) {
      return;
    }
    forget(event.pointerId);
    const finger: FingerOnControl = {
      control,
      x: event.clientX,
      y: event.clientY,
      isMarked: false,
      marking: setTimeout(() => {
        finger.isMarked = true;
        control.setAttribute(PRESSED, "");
      }, FINGER_PRESS_DELAY_MS),
    };
    fingers.set(event.pointerId, finger);
  };

  const cancel = (event: PointerEvent): void => {
    const finger = forget(event.pointerId);
    if (finger?.isMarked === true) {
      unmark(finger.control);
    }
  };

  const move = (event: PointerEvent): void => {
    const finger = fingers.get(event.pointerId);
    if (finger !== undefined && movedPastSlop(finger, event)) {
      cancel(event);
    }
  };

  const lift = (event: PointerEvent): void => {
    const finger = forget(event.pointerId);
    if (finger === undefined) {
      return;
    }
    if (finger.isMarked) {
      unmark(finger.control);
      return;
    }
    finger.control.setAttribute(PRESSED, "");
    setTimeout(() => {
      unmark(finger.control);
    }, SHORTEST_PRESS_SHOWN_MS);
  };

  const listeners = [
    ["pointerdown", press],
    ["pointermove", move],
    ["pointerup", lift],
    ["pointercancel", cancel],
  ] as const;
  for (const [type, listener] of listeners) {
    root.addEventListener(type, listener, true);
  }
  return () => {
    for (const [type, listener] of listeners) {
      root.removeEventListener(type, listener, true);
    }
    for (const pointerId of [...fingers.keys()]) {
      forget(pointerId);
    }
  };
}
