import type { PageCell } from "./page-cells.ts";

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

export interface PagesOnScreen {
  readonly first: number;
  readonly last: number;
}

export function pagesAroundScreen(
  onScreen: PagesOnScreen,
  count: number,
  kept: PagesKept,
): PageCell[] {
  const first = Math.max(0, onScreen.first - kept.behind);
  const last = Math.min(count - 1, onScreen.last + kept.ahead);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
    const page = first + offset;
    return {
      spread: [page],
      offset:
        page < onScreen.first
          ? page - onScreen.first
          : Math.max(0, page - onScreen.last),
    };
  });
}
