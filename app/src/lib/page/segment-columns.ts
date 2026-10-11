export interface SegmentRoom {
  readonly widths: readonly number[];
  readonly space: number;
  readonly gap: number;
}

export function columnsThatFit({ widths, space, gap }: SegmentRoom): number {
  const count = widths.length;
  const spanOf = (columns: number, total: number): number =>
    total + (columns - 1) * gap;
  const oneRow = widths.reduce((sum, width) => sum + width, 0);
  if (spanOf(count, oneRow) <= space) {
    return count;
  }
  const widest = Math.max(...widths);
  const evenColumns = Array.from(
    { length: count - 2 },
    (_, index) => count - 1 - index,
  ).filter((columns) => count % columns === 0);
  return (
    evenColumns.find((columns) => spanOf(columns, columns * widest) <= space) ??
    1
  );
}

/**
 * Calls `onFit` with the columns the segments fit in whenever `ruler`, which spans `track` and holds one unwrapped copy of each segment, resizes; returns a stop.
 * Fits at once when the ruler first shows, so a sheet opens at its settled height, and on the next frame after any later resize.
 */
export function followFittingColumns(
  track: HTMLElement,
  ruler: HTMLElement,
  onFit: (columns: number) => void,
): () => void {
  const fit = (): void => {
    const style = getComputedStyle(track);
    const space =
      ruler.getBoundingClientRect().width -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd);
    const widths = [...ruler.children].map(
      (copy) => copy.getBoundingClientRect().width,
    );
    onFit(
      columnsThatFit({
        widths,
        space,
        gap: Number.parseFloat(style.columnGap),
      }),
    );
  };
  let isShown = false;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    const wasShown = isShown;
    isShown = ruler.getBoundingClientRect().width > 0;
    cancelAnimationFrame(frame);
    if (!isShown) {
      return;
    }
    if (wasShown) {
      frame = requestAnimationFrame(fit);
    } else {
      fit();
    }
  });
  for (const element of [ruler, ...ruler.children]) {
    observer.observe(element);
  }
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
