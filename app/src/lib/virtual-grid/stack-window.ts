import type { Seen } from "./row-window";

export interface Strides {
  readonly row: number;
  readonly heading: number;
}

export interface RowLayout {
  readonly count: number;
  readonly isHeading: readonly boolean[];
  readonly strides: Strides;
}

export interface RowHeights {
  readonly count: number;
  readonly offsets: readonly number[];
}

export interface StackWindow {
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly size: number;
}

export function rowHeights(layout: RowLayout): RowHeights {
  const { count, isHeading, strides } = layout;
  const offsets = [0];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    offset += isHeading[index] === true ? strides.heading : strides.row;
    offsets.push(offset);
  }
  return { count, offsets };
}

export function offsetOf(heights: RowHeights, index: number): number {
  const offset = heights.offsets[index];
  if (offset === undefined) {
    throw new RangeError(
      `row ${String(index)} is outside a list of ${String(heights.count)}`,
    );
  }
  return offset;
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
  heights: RowHeights,
  seen: Seen,
  extraRows: number,
): StackWindow {
  const { count } = heights;
  const firstSeen = firstIndexWhere(
    count,
    (index) => offsetOf(heights, index + 1) > seen.top,
  );
  const firstUnseen = firstIndexWhere(
    count,
    (index) => offsetOf(heights, index) >= seen.bottom,
  );
  const start = Math.min(Math.max(firstSeen - extraRows, 0), count);
  const end = Math.min(Math.max(firstUnseen + extraRows, start), count);
  return {
    start,
    end,
    before: offsetOf(heights, start),
    size: offsetOf(heights, count),
  };
}
