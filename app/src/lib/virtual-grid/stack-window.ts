import type { Seen } from "./row-window";

export interface RowHeights {
  readonly row: number;
  readonly heading: number;
}

export interface Stack {
  readonly count: number;
  readonly heights: RowHeights;
  readonly headingsBefore: readonly number[];
}

export interface StackWindow {
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly size: number;
}

export function headingsBefore(
  isHeading: readonly boolean[],
): readonly number[] {
  let headings = 0;
  return [
    0,
    ...isHeading.map((heading) => {
      headings += heading ? 1 : 0;
      return headings;
    }),
  ];
}

export function offsetOf(stack: Stack, index: number): number {
  const { row, heading } = stack.heights;
  const known = stack.headingsBefore;
  const headings = known[Math.min(index, known.length - 1)] ?? 0;
  return (index - headings) * row + headings * heading;
}

function firstIndexWhere(
  count: number,
  isPast: (index: number) => boolean,
): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isPast(middle)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

export function stackWindow(
  stack: Stack,
  seen: Seen,
  extraRows: number,
): StackWindow {
  const { count } = stack;
  const firstSeen = firstIndexWhere(
    count,
    (index) => offsetOf(stack, index + 1) > seen.top,
  );
  const firstUnseen = firstIndexWhere(
    count,
    (index) => offsetOf(stack, index) >= seen.bottom,
  );
  const start = Math.min(Math.max(firstSeen - extraRows, 0), count);
  const end = Math.min(Math.max(firstUnseen + extraRows, start), count);
  return {
    start,
    end,
    before: offsetOf(stack, start),
    size: offsetOf(stack, count),
  };
}
