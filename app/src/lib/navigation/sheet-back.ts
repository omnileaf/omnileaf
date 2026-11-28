export interface SheetBackSize {
  readonly width: number;
  readonly height: number;
  readonly fillableHeight: number;
}

export interface SheetBackShape {
  readonly scale: number;
  readonly layoutHeight: number;
}

/** Material Components for Android's bottom container back animation: `maxScaleXDistance` and `maxScaleYDistance`. */
const SHEET_BACK = { maxShrinkWidthPx: 48, maxShrinkHeightPx: 24 } as const;

export function sheetBackShape(
  size: SheetBackSize,
  progress: number,
): SheetBackShape {
  const scaleX = 1 - (SHEET_BACK.maxShrinkWidthPx / size.width) * progress;
  const scaleY = 1 - (SHEET_BACK.maxShrinkHeightPx / size.height) * progress;
  const wanted = Math.max(0, (size.height * scaleY) / scaleX - size.height);
  const growth = Math.min(wanted, size.fillableHeight);
  return { scale: scaleX, layoutHeight: size.height + growth };
}

export function sheetBackProgressOf(
  size: SheetBackSize,
  shape: SheetBackShape,
): number {
  return ((1 - shape.scale) * size.width) / SHEET_BACK.maxShrinkWidthPx;
}
