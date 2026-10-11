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
 * Refits a frame after a resize, since a layout change inside the observer's callback is a resize loop the browser reports as an error.
 * A closed dialog's content measures 0 wide, so the control fits again as its dialog opens.
 */
export function followFittingColumns(
  track: HTMLElement,
  ruler: HTMLElement,
  onFit: (columns: number) => void,
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
