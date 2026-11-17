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
  readonly layout: RowLayout;
  readonly measured: ReadonlyMap<number, number>;
  readonly offsets: readonly number[];
}

export interface StackWindow {
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly size: number;
}

export function rowHeights(
  layout: RowLayout,
  measurements: ReadonlyMap<number, number> = new Map(),
): RowHeights {
  return laidOut(
    layout,
    new Map([...measurements].filter(([index]) => isRowOf(layout, index))),
  );
}

export function remeasured(
  heights: RowHeights,
  measurements: ReadonlyMap<number, number>,
): RowHeights {
  const { layout, measured } = heights;
  const changes = [...measurements].filter(
    ([index, height]) =>
      isRowOf(layout, index) && measured.get(index) !== height,
  );
  return changes.length === 0
    ? heights
    : laidOut(layout, new Map([...measured, ...changes]));
}

function isRowOf(layout: RowLayout, index: number): boolean {
  return index >= 0 && index < layout.count;
}

function laidOut(
  layout: RowLayout,
  measured: ReadonlyMap<number, number>,
): RowHeights {
  const { count, isHeading, strides } = layout;
  const measuredRows = [...measured].flatMap(([index, height]) =>
    isHeading[index] === true ? [] : [height],
  );
  const estimatedRow = medianOf(measuredRows) ?? strides.row;
  const offsets = [0];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    offset +=
      measured.get(index) ??
      (isHeading[index] === true ? strides.heading : estimatedRow);
    offsets.push(offset);
  }
  return { layout, measured, offsets };
}

function medianOf(values: readonly number[]): number | undefined {
  const sorted = values.toSorted((one, other) => one - other);
  const lowerMiddle = sorted[Math.floor((sorted.length - 1) / 2)];
  const upperMiddle = sorted[Math.ceil((sorted.length - 1) / 2)];
  return lowerMiddle === undefined || upperMiddle === undefined
    ? undefined
    : (lowerMiddle + upperMiddle) / 2;
}

export function offsetOf(heights: RowHeights, index: number): number {
  const offset = heights.offsets[index];
  if (offset === undefined) {
    throw new RangeError(
      `row ${String(index)} is outside a list of ${String(heights.layout.count)}`,
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
  const { count } = heights.layout;
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
