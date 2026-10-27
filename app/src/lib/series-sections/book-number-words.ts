import type { NumberRange, SeriesBook } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

export type NumberedBook = Pick<
  SeriesBook,
  "kind" | "numbers" | "volume" | "title"
>;

export interface GapWords {
  readonly title: string;
  readonly label: string;
}

interface RangeNames {
  readonly one: (inputs: { number: number }) => string;
  readonly many: (inputs: { first: number; last: number }) => string;
}

const VOLUME_NAMES: RangeNames = {
  one: m.series_volume,
  many: m.series_volumes_range,
};

const CHAPTER_NAMES: RangeNames = {
  one: m.series_chapter,
  many: m.series_chapters_range,
};

function rangeWords(range: NumberRange, names: RangeNames): string {
  return range.first === range.last
    ? names.one({ number: range.first })
    : names.many(range);
}

export function bookWords(book: NumberedBook): string {
  if (book.numbers === null) {
    return book.title;
  }
  switch (book.kind) {
    case "volume":
      return rangeWords(book.numbers, VOLUME_NAMES);
    case "chapter":
      return rangeWords(book.numbers, CHAPTER_NAMES);
    case "special":
    case null:
      return book.title;
  }
}

export function volumeWords(book: NumberedBook): string | undefined {
  return book.kind === "chapter" && book.volume !== null
    ? m.series_in_volume({ number: book.volume })
    : undefined;
}

export function missingVolumeCount(missing: readonly NumberRange[]): number {
  return missing.reduce(
    (count, { first, last }) => count + last - first + 1,
    0,
  );
}

export function gapWords(missing: NumberRange): GapWords {
  return {
    title: rangeWords(missing, VOLUME_NAMES),
    label: m.series_gap_label({
      count: missingVolumeCount([missing]),
      volumes: missingVolumeNumbers([missing]),
    }),
  };
}

const LONGEST_RUN_NAMED_ONE_BY_ONE = 2;

function runNumbers(
  { first, last }: NumberRange,
  numbers: Intl.NumberFormat,
): string[] {
  return last - first + 1 <= LONGEST_RUN_NAMED_ONE_BY_ONE
    ? [...new Set([first, last])].map((number) => numbers.format(number))
    : [numbers.formatRange(first, last)];
}

export function missingVolumeNumbers(missing: readonly NumberRange[]): string {
  const numbers = new Intl.NumberFormat(getLocale());
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    missing.flatMap((run) => runNumbers(run, numbers)),
  );
}
