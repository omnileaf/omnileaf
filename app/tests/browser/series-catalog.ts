import type { FakeBackend } from "./fake-backend.ts";

export type WireSeries = Awaited<
  ReturnType<FakeBackend["librarySeries"]>
>["series"][number];

export const SERIES_PER_PAGE = 50;

export function sampleSeries(count: number, from = 1): WireSeries[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(from + index).padStart(4, "0");
    return {
      id: `0190a3e4-0000-8000-8000-${number.padStart(12, "0")}`,
      title: `Sample Series ${number}`,
      bookCount: 1,
      unreadCount: 1,
      cover: null,
      language: null,
      hasDownloads: false,
      isAdult: false,
      continuesFrom: null,
    };
  });
}

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
