/** Blink and WebKit lay boxes out in whole sixty-fourths of a pixel. */
const LAYOUT_UNITS_PER_PX = 64;

function ownScaleOf(element: Element): number {
  return new DOMMatrixReadOnly(getComputedStyle(element).transform).d;
}

export function shownScaleOf(element: Element): number {
  let scale = 1;
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    scale *= ownScaleOf(at);
  }
  return scale;
}

function isMeasurable(scale: number): boolean {
  return Number.isFinite(scale) && scale > 0;
}

export function measurableScaleOf(element: Element): number | undefined {
  const scale = shownScaleOf(element);
  return isMeasurable(scale) ? scale : undefined;
}

export function laidOutSize(shown: number, scale: number): number {
  return (
    Math.round((shown / scale) * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX
  );
}
