import { expect, test } from "vitest";

import { settlingOf } from "./back-spring";

const MEDIUM_UNBOUNCY = { stiffness: 1500, restingWithin: 0.0075 };

function stopsOf(easing: string): number[] {
  const inside = /^linear\((.*)\)$/.exec(easing)?.[1] ?? "";
  return inside.split(",").map(Number);
}

test("settles a medium, unbouncy spring within 180 ms", () => {
  expect(settlingOf(MEDIUM_UNBOUNCY).durationMs).toBe(180);
});

test("eases from rest to the end without passing it", () => {
  const stops = stopsOf(settlingOf(MEDIUM_UNBOUNCY).easing);

  expect(stops.at(0)).toBe(0);
  expect(stops.at(-1)).toBe(1);
  expect(
    stops.every((stop, at) => at === 0 || stop >= (stops[at - 1] ?? 0)),
  ).toBe(true);
});

test("covers most of the way early, as a spring released from rest does", () => {
  const stops = stopsOf(settlingOf(MEDIUM_UNBOUNCY).easing);

  expect(stops[Math.floor(stops.length / 4)]).toBeGreaterThan(0.5);
});
