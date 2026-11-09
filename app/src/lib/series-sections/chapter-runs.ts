import type { NumberRange, SeriesBook } from "#lib/ipc/bindings.ts";

export type ChapterRow =
  | {
      readonly kind: "run";
      readonly key: string;
      readonly chapters: NumberRange | undefined;
    }
  | { readonly kind: "book"; readonly key: string; readonly book: SeriesBook };

interface Run {
  readonly index: number | undefined;
  readonly key: string;
  readonly books: SeriesBook[];
}

const CHAPTERS_PER_RUN = 12;

function runIndex({ numbers }: SeriesBook): number | undefined {
  return numbers === null
    ? undefined
    : Math.ceil(numbers.first / CHAPTERS_PER_RUN);
}

function heldChapters(books: readonly SeriesBook[]): NumberRange | undefined {
  const numbers = books.flatMap(({ numbers: held }) =>
    held === null ? [] : [held],
  );
  return numbers.length === 0
    ? undefined
    : {
        first: Math.min(...numbers.map(({ first }) => first)),
        last: Math.max(...numbers.map(({ last }) => last)),
      };
}

function runsOf(books: readonly SeriesBook[]): readonly Run[] {
  const runs: Run[] = [];
  for (const book of books) {
    const index = runIndex(book);
    const last = runs.at(-1);
    if (last !== undefined && last.index === index) {
      last.books.push(book);
    } else {
      runs.push({ index, key: `run-${book.id}`, books: [book] });
    }
  }
  return runs;
}

export function chapterRuns(
  books: readonly SeriesBook[],
): readonly ChapterRow[] {
  return runsOf(books).flatMap(({ key, books: held }): ChapterRow[] => [
    { kind: "run", key, chapters: heldChapters(held) },
    ...held.map((book) => ({ kind: "book" as const, key: book.id, book })),
  ]);
}
