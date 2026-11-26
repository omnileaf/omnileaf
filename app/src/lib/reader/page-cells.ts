import type { Spread } from "./spreads";

export interface PageCell {
  readonly spread: Spread;
  readonly offset: number;
}

const NEIGHBOUR_TURNS = 1;

export function cellsAround(
  spreads: readonly Spread[],
  position: number,
  kept: readonly number[],
): PageCell[] {
  const isKept = (spread: Spread, offset: number): boolean =>
    Math.abs(offset) <= NEIGHBOUR_TURNS ||
    spread.some((page) => kept.includes(page));
  return spreads
    .map((spread, index) => ({ spread, offset: index - position }))
    .filter(({ spread, offset }) => isKept(spread, offset));
}
