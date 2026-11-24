import { cssLinearEasing } from "./css-easing";

interface SpringSettling {
  readonly durationMs: number;
  readonly easing: string;
}

interface UnbouncySpring {
  readonly stiffness: number;
  readonly restingWithin: number;
}

const MS_PER_SECOND = 1000;
const EASING_STOPS = 16;

function remainingAfter(spring: UnbouncySpring, ms: number): number {
  const turned = Math.sqrt(spring.stiffness) * (ms / MS_PER_SECOND);
  return (1 + turned) * Math.exp(-turned);
}

function settledAfterMs(spring: UnbouncySpring): number {
  let ms = 0;
  while (remainingAfter(spring, ms) > spring.restingWithin) {
    ms += 1;
  }
  return ms;
}

function easingOf(spring: UnbouncySpring, durationMs: number): string {
  const travelled = 1 - remainingAfter(spring, durationMs);
  return cssLinearEasing(
    (share) => (1 - remainingAfter(spring, durationMs * share)) / travelled,
    EASING_STOPS,
  );
}

export function settlingOf(spring: UnbouncySpring): SpringSettling {
  const durationMs = settledAfterMs(spring);
  return { durationMs, easing: easingOf(spring, durationMs) };
}
