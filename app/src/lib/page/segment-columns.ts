export interface SegmentRoom {
  readonly widths: readonly number[];
  readonly space: number;
  readonly gap: number;
  readonly hasEqualColumns?: boolean;
  readonly spansLastRow?: boolean;
}

export function columnsThatFit({
  widths,
  space,
  gap,
  hasEqualColumns = false,
  spansLastRow = false,
}: SegmentRoom): number {
  const count = widths.length;
  const widest = Math.max(...widths);
  const spanOf = (columns: number, total: number): number =>
    total + (columns - 1) * gap;
  const oneRow = hasEqualColumns
    ? count * widest
    : widths.reduce((sum, width) => sum + width, 0);
  if (spanOf(count, oneRow) <= space) {
    return count;
  }
  const fewerColumns = Array.from(
    { length: count - 2 },
    (_, index) => count - 1 - index,
  );
  if (spansLastRow) {
    return (
      fewerColumns.find((columns) =>
        fitsWithLastSpanning(widths, columns, space, gap),
      ) ?? 1
    );
  }
  return (
    fewerColumns
      .filter((columns) => count % columns === 0)
      .find((columns) => spanOf(columns, columns * widest) <= space) ?? 1
  );
}

function fitsWithLastSpanning(
  widths: readonly number[],
  columns: number,
  space: number,
  gap: number,
): boolean {
  const column = (space - (columns - 1) * gap) / columns;
  const lastSpan = columns - ((widths.length - 1) % columns);
  const last = widths.at(-1) ?? 0;
  return (
    widths.slice(0, -1).every((width) => width <= column) &&
    last <= lastSpan * column + (lastSpan - 1) * gap
  );
}

/** Refits a frame after a resize, since a layout change inside the observer's callback is a resize loop the browser reports as an error. */
export function followFittingColumns(
  track: HTMLElement,
  ruler: HTMLElement,
  onFit: (columns: number) => void,
  layout: Pick<SegmentRoom, "hasEqualColumns" | "spansLastRow"> = {},
): () => void {
  const fit = (): void => {
    const rulerWidth = ruler.getBoundingClientRect().width;
    if (rulerWidth === 0) {
      return;
    }
    const style = getComputedStyle(track);
    const space =
      rulerWidth -
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
        ...layout,
      }),
    );
  };
  let frame = 0;
  const resizes = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
  const opening = new MutationObserver(fit);
  fit();
  const dialog = track.closest("dialog");
  if (dialog !== null) {
    opening.observe(dialog, { attributeFilter: ["open"] });
  }
  for (const element of [ruler, ...ruler.children]) {
    resizes.observe(element);
  }
  return () => {
    resizes.disconnect();
    opening.disconnect();
    cancelAnimationFrame(frame);
  };
}
