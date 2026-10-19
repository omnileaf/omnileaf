import type { BookPage } from "#lib/ipc/bindings.ts";

const TALL_RATIO = 2;
const FEWEST_KNOWN = 2;
const TALL_SHARE = 0.75;

/** Whether a book's pages are tall and never form spreads, none when too few of their sizes are known. */
export function pagesLookLikeStrip(pages: readonly BookPage[]): boolean | null {
  const sizes = pages.flatMap((page) =>
    page.size === null ? [] : [page.size],
  );
  if (sizes.length < FEWEST_KNOWN) {
    return null;
  }
  if (sizes.some(({ width, height }) => width > height)) {
    return false;
  }
  const tall = sizes.filter(
    ({ width, height }) => height >= width * TALL_RATIO,
  );
  return tall.length >= sizes.length * TALL_SHARE;
}
