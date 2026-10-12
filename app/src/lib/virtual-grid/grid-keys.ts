export type Reveal = (index: number) => Promise<HTMLElement | undefined>;

export function optionId(listId: string, key: string): string {
  return `${listId}-${key}`;
}

/** How many columns the grid lays its items out in, one before it has any. */
export function columnsOf(grid: Element): number {
  const tracks = getComputedStyle(grid)
    .gridTemplateColumns.split(" ")
    .filter((track) => track !== "");
  return Math.max(1, tracks.length);
}

interface Layout {
  readonly count: number;
  readonly columns: number;
}

/** The choice a key makes active among `count` laid out `columns` to a row, or undefined for a key the field keeps, as every key but Arrow Down is until a choice is active. */
export function movedTo(
  key: string,
  active: number | undefined,
  { count, columns }: Layout,
): number | undefined {
  const last = count - 1;
  if (count === 0) {
    return undefined;
  }
  if (active === undefined) {
    return key === "ArrowDown" ? 0 : undefined;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return last;
  }
  const steps: Partial<Record<string, number>> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  const step = steps[key];
  if (step === undefined) {
    return undefined;
  }
  const next = active + step;
  return next < 0 || next > last ? active : next;
}
