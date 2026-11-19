import type { NumberRange, SeriesBook } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import {
  bookWords,
  missingVolumeNumbers,
} from "#lib/series-sections/book-number-words.ts";

const MOST_BOOKS_NAMED = 3;

export interface PartlyConnected {
  readonly awayCount: number;
  readonly bookCount: number;
  readonly loaded: readonly SeriesBook[];
}

export interface AwayWording {
  readonly title: string;
  readonly body: string;
}

function singleVolume(book: SeriesBook): NumberRange | undefined {
  return book.kind === "volume" &&
    book.numbers !== null &&
    book.numbers.first === book.numbers.last
    ? book.numbers
    : undefined;
}

function whereAway(away: readonly SeriesBook[], awayCount: number): string {
  if (away.length !== awayCount || awayCount > MOST_BOOKS_NAMED) {
    return m.series_away_unnamed({ count: awayCount });
  }
  const volumes = away.map(singleVolume);
  if (volumes.every((volume): volume is NumberRange => volume !== undefined)) {
    return m.series_away_volumes({
      count: awayCount,
      volumes: missingVolumeNumbers(volumes),
    });
  }
  const names = new Intl.ListFormat(getLocale(), {
    type: "conjunction",
  }).format(away.map(bookWords));
  return m.series_away_named({ count: awayCount, names });
}

export function partlyConnectedWording({
  awayCount,
  bookCount,
  loaded,
}: PartlyConnected): AwayWording {
  const away = loaded.filter((book) => book.file.kind === "notConnected");
  return {
    title: m.series_partly_connected_title({
      count: awayCount,
      total: bookCount,
    }),
    body: [
      whereAway(away, awayCount),
      m.series_away_others({ count: bookCount - awayCount }),
      m.series_progress_safe(),
    ].join(" "),
  };
}
