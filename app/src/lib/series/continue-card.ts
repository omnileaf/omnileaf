import type { SeriesBook } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export interface ContinueProgress {
  readonly upNext: SeriesBook | null;
  readonly bookCount: number;
  readonly readCount: number;
  readonly secondsLeft: number | null;
}

export interface ReadCounts {
  readonly read: number;
  readonly total: number;
}

export interface ContinueWords {
  readonly allRead: () => string;
  readonly allReadBody: () => string;
  readonly readCount: (counts: ReadCounts) => string;
}

export const SERIES_CONTINUE_WORDS: ContinueWords = {
  allRead: m.series_all_read,
  allReadBody: m.series_all_read_body,
  readCount: m.series_read_count,
};

export const VOLUME_CONTINUE_WORDS: ContinueWords = {
  allRead: m.series_volume_all_read,
  allReadBody: m.series_volume_all_read_body,
  readCount: m.series_volume_read_count,
};
