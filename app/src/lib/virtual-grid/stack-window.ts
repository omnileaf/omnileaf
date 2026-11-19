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

export interface StackWindow {
  readonly start: number;
  readonly end: number;
  readonly before: number;
  readonly size: number;
}

export class RowHeights {
  readonly #layout: RowLayout;
  readonly #offsets: readonly number[];

  constructor(
    layout: RowLayout,
    measurements: ReadonlyMap<number, number> = new Map(),
  ) {
    this.#layout = layout;
    this.#offsets = offsetsOf(
      layout,
      new Map([...measurements].filter(([index]) => isRowOf(layout, index))),
    );
  }

  get count(): number {
    return this.#layout.count;
  }

  offsetOf(index: number): number {
    const offset = this.#offsets[index];
    if (offset === undefined) {
      throw new RangeError(
        `row ${String(index)} is outside a list of ${String(this.count)}`,
      );
    }
    return offset;
  }

  rowAt(offset: number): number {
    return firstIndexWhere(
      this.count,
      (index) => this.offsetOf(index + 1) > offset,
    );
  }
}

function isRowOf(layout: RowLayout, index: number): boolean {
  return index >= 0 && index < layout.count;
}

function offsetsOf(
  layout: RowLayout,
  measured: ReadonlyMap<number, number>,
): readonly number[] {
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
  return offsets;
}

function medianOf(values: readonly number[]): number | undefined {
  const sorted = values.toSorted((one, other) => one - other);
  const lowerMiddle = sorted[Math.floor((sorted.length - 1) / 2)];
  const upperMiddle = sorted[Math.ceil((sorted.length - 1) / 2)];
  return lowerMiddle === undefined || upperMiddle === undefined
    ? undefined
    : (lowerMiddle + upperMiddle) / 2;
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
  const firstSeen = heights.rowAt(seen.top);
  const firstUnseen = firstIndexWhere(
    count,
    (index) => heights.offsetOf(index) >= seen.bottom,
  );
  const start = Math.min(Math.max(firstSeen - extraRows, 0), count);
  const end = Math.min(Math.max(firstUnseen + extraRows, start), count);
  return {
    start,
    end,
    before: heights.offsetOf(start),
    size: heights.offsetOf(count),
  };
}
