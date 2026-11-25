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
