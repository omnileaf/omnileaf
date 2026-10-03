import type { FakeBackend } from "./fake-backend.ts";

export type WireSeries = Awaited<
  ReturnType<FakeBackend["librarySeries"]>
>["series"][number];

const SERIES_PER_PAGE = 50;

/** Generated series named "Sample Series 0001" onwards, with no covers so specs need no image routes. */
export function sampleSeries(count: number, from = 1): WireSeries[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(from + index).padStart(4, "0");
    return {
      id: `0190a3e4-0000-8000-8000-${number.padStart(12, "0")}`,
      title: `Sample Series ${number}`,
      bookCount: 1,
      cover: null,
    };
  });
}

/** Lists whatever `catalog` holds when asked, a page at a time, with each page's start as its cursor. */
export function pagedSeries(
  catalog: () => readonly WireSeries[],
): FakeBackend["librarySeries"] {
  return (after) => {
    const start = after === null ? 0 : Number(after);
    const end = start + SERIES_PER_PAGE;
    return {
      series: catalog().slice(start, end),
      next: end < catalog().length ? String(end) : null,
    };
  };
}
