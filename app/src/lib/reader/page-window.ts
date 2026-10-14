const PAGES_BEHIND = 1;

export function pagesAround(
  shown: number,
  count: number,
  ahead: number,
): number[] {
  const first = Math.max(0, shown - PAGES_BEHIND);
  const last = Math.min(count - 1, shown + ahead);
  return Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, offset) => first + offset,
  );
}
