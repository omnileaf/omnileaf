import type { FakeBackend } from "./fake-backend.ts";

export type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

export const THURSDAY_EVENING = new Date("2026-10-08T22:30:00Z");
export const MINUTE = 60;
const DAY_MS = 86_400_000;

export function bookId(number: number): string {
  return `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`;
}

export function seriesId(number: number): string {
  return `0190a3e4-0000-8000-8001-${String(number).padStart(12, "0")}`;
}

export function seriesTitle(number: number): string {
  return `Sample Series ${String(number).padStart(2, "0")}`;
}

export function bookTitle(number: number): string {
  return `Volume ${String(number)}`;
}

export function entry(
  number: number,
  startedAt: string,
  readTo: WireEntry["readTo"],
): WireEntry {
  return {
    book: bookId(number),
    bookTitle: bookTitle(number),
    series: seriesId(number),
    seriesTitle: seriesTitle(number),
    position: number,
    cover: null,
    startedAtMs: Date.parse(startedAt),
    utcOffsetMinutes: 0,
    readSeconds: 20 * MINUTE,
    readTo,
    reading:
      readTo.state === "end"
        ? { state: "read" }
        : { state: "started", page: readTo.page },
    day: {
      day: Math.floor(Date.parse(startedAt) / DAY_MS),
      readSeconds: 20 * MINUTE,
    },
  };
}
