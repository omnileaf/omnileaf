import type { PageCell } from "./page-cells.ts";
import type { Heading } from "./page-window.ts";

/** Android's webview hands every page it asks the app for to the app's Java heap as one whole array, so page images asked for at once are held to this many. */
export const PAGES_LOADING_AT_ONCE = 3;
export const THUMBNAILS_LOADING_AT_ONCE = 4;
export const LONGEST_IMAGE_LOAD_MS = 20_000;

export function pagesByUrgency(
  cells: readonly PageCell[],
  heading: Heading,
): number[] {
  const ahead = heading === "forward" ? 1 : -1;
  return cells
    .toSorted(
      (one, other) =>
        Math.abs(one.offset) - Math.abs(other.offset) ||
        Math.sign(other.offset) * ahead - Math.sign(one.offset) * ahead,
    )
    .flatMap(({ spread }) => spread);
}

export function nextPagesToAsk(
  byUrgency: readonly number[],
  asked: ReadonlySet<number>,
  room: number,
): number[] {
  return byUrgency
    .filter((page) => !asked.has(page))
    .slice(0, Math.max(0, room));
}
