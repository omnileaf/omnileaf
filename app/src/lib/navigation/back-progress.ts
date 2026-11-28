import { cubicBezier } from "./cubic-bezier";

/** Android eases a back gesture's progress along `PathInterpolator(0.1, 0.1, 0, 1)` before any back animation reads it. */
const GESTURE_CURVE = cubicBezier(0.1, 0.1, 0, 1);

function clampedProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

export function easedBackProgress(progress: number): number {
  return GESTURE_CURVE(clampedProgress(progress));
}
