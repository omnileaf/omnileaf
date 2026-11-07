import type { SeriesBook } from "#lib/ipc/bindings.ts";

export function book(
  position: number,
  reading: SeriesBook["reading"] = { state: "notStarted" },
): SeriesBook {
  return {
    id: `0190a3e4-0000-8000-8000-0000000000b${String(position)}` as SeriesBook["id"],
    position,
    title: `Volume ${String(position)}`,
    cover: null,
    addedAtMs: 0,
    reading,
    pageCount: 188,
    isBookmarked: false,
    isNew: false,
    isFileMissing: false,
    kind: null,
    numbers: null,
    volume: null,
    section: "volumes",
  };
}
