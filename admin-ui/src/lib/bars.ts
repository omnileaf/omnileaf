import type { Tally } from "#lib/reports.ts";

export interface BarRow extends Tally {
  readonly percent: number;
}

const FULL_BAR = 100;
const TENTHS = 10;
const MIN_VISIBLE_PERCENT = 1;

function percentOf(count: number, longest: number): number {
  if (count <= 0 || longest <= 0) {
    return 0;
  }
  const nearestTenth =
    Math.round((count / longest) * FULL_BAR * TENTHS) / TENTHS;
  return Math.max(MIN_VISIBLE_PERCENT, nearestTenth);
}

export function barRows(tallies: readonly Tally[]): readonly BarRow[] {
  const longest = Math.max(0, ...tallies.map(({ count }) => count));
  return tallies.map((tally) => ({
    ...tally,
    percent: percentOf(tally.count, longest),
  }));
}
