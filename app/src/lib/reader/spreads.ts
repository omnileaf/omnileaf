import { m } from "#lib/paraglide/messages.js";

import type { Size } from "./page-fit";

export type Spread = readonly number[];

function isWide(size: Size | null): boolean {
  return size !== null && size.width > size.height;
}

/** Pages shown together: one at a time, or the cover alone and then pairs, with a wide page always alone. */
export function spreadsOf(
  sizes: readonly (Size | null)[],
  isTwoUp: boolean,
): Spread[] {
  if (!isTwoUp) {
    return sizes.map((_, index) => [index]);
  }
  const spreads: Spread[] = [];
  let index = 0;
  while (index < sizes.length) {
    const next = index + 1;
    const pairs =
      index > 0 &&
      next < sizes.length &&
      !isWide(sizes[index] ?? null) &&
      !isWide(sizes[next] ?? null);
    spreads.push(pairs ? [index, next] : [index]);
    index = pairs ? next + 1 : next;
  }
  return spreads;
}

export function spreadAt(spreads: readonly Spread[], page: number): number {
  const found = spreads.findIndex((spread) => spread.includes(page));
  return found === -1 ? 0 : found;
}

export function spreadPosition(spread: Spread, count: number): string {
  const [first = 0] = spread;
  const last = spread.at(-1) ?? first;
  return last === first
    ? m.reader_position({ page: first + 1, count })
    : m.reader_position_pair({ first: first + 1, last: last + 1, count });
}
