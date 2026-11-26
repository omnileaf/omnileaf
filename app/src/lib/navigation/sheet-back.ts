export interface SheetBackSize {
  readonly width: number;
  readonly height: number;
}

export interface SheetBackShape {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly contentScaleY: number;
}

/** Material Components for Android's bottom container back animation: `maxScaleXDistance` and `maxScaleYDistance`. */
const SHEET_BACK = { maxShrinkWidthPx: 48, maxShrinkHeightPx: 24 } as const;

export function sheetBackShape(
  size: SheetBackSize,
  progress: number,
): SheetBackShape {
  const scaleX = 1 - (SHEET_BACK.maxShrinkWidthPx / size.width) * progress;
  const scaleY = 1 - (SHEET_BACK.maxShrinkHeightPx / size.height) * progress;
  return { scaleX, scaleY, contentScaleY: scaleX / scaleY };
}

export function sheetBackProgressOf(
  size: SheetBackSize,
  shape: SheetBackShape,
): number {
  return ((1 - shape.scaleX) * size.width) / SHEET_BACK.maxShrinkWidthPx;
}
