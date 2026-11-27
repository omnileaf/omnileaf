import type { Snippet } from "svelte";

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

function isNearView(index: number, inView: SpreadsInView): boolean {
  return (
    index >= inView.low - inView.reach && index <= inView.high + inView.reach
  );
}

export function cellsAround(
  spreads: readonly Spread[],
  inView: SpreadsInView,
  kept: readonly number[],
): PageCell[] {
  const isKept = (spread: Spread, index: number): boolean =>
    isNearView(index, inView) || spread.some((page) => kept.includes(page));
  return spreads
    .map((spread, index) => ({ spread, index }))
    .filter(({ spread, index }) => isKept(spread, index))
    .map(({ spread, index }) => ({ spread, offset: index - inView.at }));
}

export interface EdgeView {
  readonly isCurrent: boolean;
  readonly isOnScreen: boolean;
}

export interface EdgePage {
  readonly at: number;
  readonly page: Snippet<[EdgeView]>;
}

export interface EdgeCell {
  readonly at: number;
  readonly offset: number;
}

export function edgesAround(
  ats: readonly number[],
  inView: SpreadsInView,
): EdgeCell[] {
  return ats
    .filter((at) => isNearView(at, inView))
    .map((at) => ({ at, offset: at - inView.at }));
}
