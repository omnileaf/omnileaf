export interface GridShape {
  readonly count: number;
  readonly columns: number;
  readonly rowStride: number;
}

export interface Seen {
  readonly top: number;
  readonly bottom: number;
}

export interface RowWindow {
  readonly firstRow: number;
  readonly rows: number;
  readonly start: number;
  readonly end: number;
}

export function rowWindow(
  shape: GridShape,
  seen: Seen,
  extraRows: number,
): RowWindow {
  const rows = Math.ceil(shape.count / shape.columns);
  const firstRow = clamp(
    Math.floor(seen.top / shape.rowStride) - extraRows,
    0,
    rows,
  );
  const endRow = clamp(
    Math.ceil(seen.bottom / shape.rowStride) + extraRows,
    firstRow,
    rows,
  );
  return {
    firstRow,
    rows,
    start: firstRow * shape.columns,
    end: Math.min(shape.count, endRow * shape.columns),
  };
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), highest);
}
