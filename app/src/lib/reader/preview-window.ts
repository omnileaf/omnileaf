export interface PreviewReach {
  readonly before: number;
  readonly after: number;
}

export interface PreviewWindow {
  readonly first: number;
  readonly last: number;
}

export function previewWindow(
  shown: number,
  pageCount: number,
  { before, after }: PreviewReach,
): PreviewWindow {
  const size = Math.min(before + after + 1, pageCount);
  const first = Math.max(0, Math.min(shown - before, pageCount - size));
  return { first, last: first + size - 1 };
}
