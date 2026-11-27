import type { Spread } from "./spreads";

export interface PageCell {
  readonly spread: Spread;
  readonly offset: number;
}

export interface SpreadsInView {
  readonly at: number;
  readonly low: number;
  readonly high: number;
  readonly reach: number;
}

export function cellsAround(
  spreads: readonly Spread[],
  inView: SpreadsInView,
  kept: readonly number[],
): PageCell[] {
  const isKept = (spread: Spread, index: number): boolean =>
    (index >= inView.low - inView.reach &&
      index <= inView.high + inView.reach) ||
    spread.some((page) => kept.includes(page));
  return spreads
    .map((spread, index) => ({ spread, index }))
    .filter(({ spread, index }) => isKept(spread, index))
    .map(({ spread, index }) => ({ spread, offset: index - inView.at }));
}
