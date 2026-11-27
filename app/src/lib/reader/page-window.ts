export type Heading = "forward" | "back";

export interface PagesKept {
  readonly ahead: number;
  readonly behind: number;
}

export function pagesAround(
  shown: number,
  count: number,
  kept: PagesKept,
): number[] {
  const first = Math.max(0, shown - kept.behind);
  const last = Math.min(count - 1, shown + kept.ahead);
  return Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, offset) => first + offset,
  );
}
