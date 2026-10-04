const PAGES_BEHIND = 1;

/** The pages kept ready around the one shown: the one before it and the next `ahead`, within the book. */
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
