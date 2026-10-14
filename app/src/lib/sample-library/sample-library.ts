import type {
  CreatorRole,
  ReadingDirection,
  RelatedReason,
} from "#lib/ipc/bindings.ts";

export type SampleArt = 1 | 2 | 3 | 4 | 5;

export type SampleFile = "present" | "missing" | "damaged";

export type SampleReading =
  | { readonly state: "notStarted" }
  | { readonly state: "started"; readonly page: number }
  | { readonly state: "read" };

export interface SampleBook {
  readonly title: string;
  readonly pageCount: number;
  readonly reading: SampleReading;
  readonly isBookmarked: boolean;
  readonly isNew: boolean;
  readonly file: SampleFile;
}

export interface SampleCreator {
  readonly name: string;
  readonly role: CreatorRole | null;
}

export interface SampleSeries {
  readonly number: number;
  readonly title: string;
  readonly art: SampleArt;
  readonly format: string;
  readonly creators: readonly SampleCreator[];
  readonly summary: string | undefined;
  readonly tags: readonly string[];
  readonly readingDirection: ReadingDirection | null;
  readonly related: readonly SampleRelation[];
  readonly books: readonly SampleBook[];
}

export interface SampleRelation {
  readonly number: number;
  readonly reason: RelatedReason;
}

const ID_PREFIX = "5a4d1e00-0000-4000";
const SERIES_DIGITS = 12;
const BOOK_DIGITS = 6;

export function sampleSeriesId(series: number): string {
  return `${ID_PREFIX}-8000-${String(series).padStart(SERIES_DIGITS, "0")}`;
}

export function sampleBookId(series: number, book: number): string {
  return `${ID_PREFIX}-8001-${String(series).padStart(BOOK_DIGITS, "0")}${String(book).padStart(BOOK_DIGITS, "0")}`;
}

const NOT_STARTED: SampleReading = { state: "notStarted" };
const READ: SampleReading = { state: "read" };

function book(
  title: string,
  pageCount: number,
  reading: SampleReading = NOT_STARTED,
): SampleBook {
  return {
    title,
    pageCount,
    reading,
    isBookmarked: false,
    isNew: false,
    file: "present",
  };
}

function volumes(count: number, readUpTo: number, pages = 180): SampleBook[] {
  return Array.from({ length: count }, (_, index) =>
    book(
      `Volume ${String(index + 1)}`,
      pages + ((index * 7) % 23),
      index < readUpTo ? READ : NOT_STARTED,
    ),
  );
}

const SAMPLE_04_PAGES = [188, 176, 192, 184, 190, 186, 200, 196] as const;
const SAMPLE_04_SAVED_PAGE = 14;
const SAMPLE_04_SECOND_SAVED_PAGE = 31;

function sample04Books(sixth: SampleFile): SampleBook[] {
  return SAMPLE_04_PAGES.map((pageCount, index) => {
    const number = index + 1;
    const reading: SampleReading =
      number <= 2
        ? READ
        : number === 3
          ? { state: "started", page: SAMPLE_04_SAVED_PAGE }
          : number === 5
            ? { state: "started", page: SAMPLE_04_SECOND_SAVED_PAGE }
            : NOT_STARTED;
    return {
      ...book(`Volume ${String(number)}`, pageCount, reading),
      isBookmarked: number === 2 || number === 5,
      isNew: number === 8,
      file: number === 6 ? sixth : "present",
    };
  });
}

const LONG_CHAPTER_TITLES: Readonly<Record<number, string>> = {
  144: "The Night Ferry",
  145: "Salt and Lanterns",
  146: "A Letter Unsent",
  147: "Fog over the Harbour",
  148: "The Harbour Gate at Night",
  149: "Low Tide",
  150: "What the Keeper Kept",
  151: "North Wind",
  152: "An Empty Chair at Supper That Nobody Mentions",
  153: "Morning Bells",
  154: "The Second Letter",
};
const LONG_SERIES_CHAPTERS = 154;
const LONG_SERIES_CURRENT = 148;
const LONG_SERIES_SAVED_PAGE = 9;
const LONG_SERIES_BOOKMARKED = 146;

function longSeriesBooks(): SampleBook[] {
  return Array.from({ length: LONG_SERIES_CHAPTERS }, (_, index) => {
    const number = index + 1;
    const name = LONG_CHAPTER_TITLES[number];
    const title =
      name === undefined
        ? `Chapter ${String(number)}`
        : `Chapter ${String(number)} · ${name}`;
    const reading: SampleReading =
      number < LONG_SERIES_CURRENT
        ? READ
        : number === LONG_SERIES_CURRENT
          ? { state: "started", page: LONG_SERIES_SAVED_PAGE }
          : NOT_STARTED;
    const pageCount =
      number < LONG_SERIES_CURRENT
        ? 22
        : number === LONG_SERIES_CURRENT
          ? 24
          : 26;
    return {
      ...book(title, pageCount, reading),
      isBookmarked: number === LONG_SERIES_BOOKMARKED,
    };
  });
}

export const LONG_TITLE =
  "The Lighthouse Keeper’s Apprentice Spends Every Winter Writing Letters to a Sister Across the Northern Sea";

const AUTHOR_A = "Author A";

function series(
  number: number,
  title: string,
  art: SampleArt,
  books: readonly SampleBook[],
  details: Partial<
    Pick<
      SampleSeries,
      | "format"
      | "creators"
      | "summary"
      | "tags"
      | "readingDirection"
      | "related"
    >
  > = {},
): SampleSeries {
  return {
    number,
    title,
    art,
    format: details.format ?? "Manga",
    creators: details.creators ?? [],
    summary: details.summary,
    tags: details.tags ?? [],
    readingDirection: details.readingDirection ?? null,
    related: details.related ?? [],
    books,
  };
}

function numbered(number: number): string {
  return `Sample Series ${String(number).padStart(2, "0")}`;
}

/** The library drawn on the "Omnileaf interface v2" boards, newest first, so sorting by date added in descending order lists it as the boards do. */
export function sampleLibrary(sixthVolume: SampleFile): SampleSeries[] {
  return [
    series(1, numbered(1), 1, volumes(12, 9), {
      creators: [{ name: AUTHOR_A, role: "storyAndArt" }],
    }),
    series(4, numbered(4), 2, sample04Books(sixthVolume), {
      creators: [{ name: AUTHOR_A, role: "storyAndArt" }],
      summary:
        "A lighthouse keeper’s apprentice spends a winter at the harbour gate, writing letters to a sister across the northern sea.",
      tags: ["Slice of life", "Seinen", "Sea", "Letters"],
      related: [
        { number: 7, reason: { kind: "sameWriter" } },
        { number: 6, reason: { kind: "sharedTag", tag: "Slice of life" } },
        { number: 1, reason: { kind: "sameWriter" } },
      ],
    }),
    series(2, numbered(2), 3, volumes(5, 5)),
    series(
      19,
      LONG_TITLE,
      4,
      [
        book("Volume 1 · Arrival at the Harbour Gate", 212, READ),
        book("Volume 2 · The Lighthouse Keeper and the Long Winter", 230, READ),
        book("Volume 3 · Letters from Across the Northern Sea", 224),
      ],
      {
        format: "Light novel",
        creators: [
          { name: AUTHOR_A, role: "story" },
          { name: "Author B", role: "story" },
          { name: "Author C", role: "art" },
          { name: "Author D", role: "art" },
        ],
        summary:
          "A lighthouse keeper’s apprentice spends a winter at the harbour gate, writing letters to a sister across the northern sea.",
        tags: ["Slice of life", "Sea", "Letters"],
      },
    ),
    series(3, numbered(3), 5, volumes(22, 0), {
      readingDirection: "rightToLeft",
    }),
    series(5, numbered(5), 1, volumes(1, 1)),
    series(6, numbered(6), 3, volumes(9, 7), {
      creators: [{ name: AUTHOR_A, role: "story" }],
      tags: ["Slice of life"],
    }),
    series(8, numbered(8), 2, volumes(4, 0)),
    series(9, numbered(9), 4, volumes(14, 14)),
    series(10, numbered(10), 5, volumes(2, 0)),
    series(11, numbered(11), 1, longSeriesBooks()),
    series(12, numbered(12), 3, volumes(30, 0)),
    series(7, numbered(7), 4, volumes(5, 3), {
      creators: [{ name: AUTHOR_A, role: "story" }],
    }),
    series(13, numbered(13), 5, volumes(7, 2)),
    series(14, numbered(14), 1, volumes(3, 0)),
    series(15, numbered(15), 2, volumes(11, 11)),
    series(16, numbered(16), 3, volumes(6, 1)),
    series(17, numbered(17), 4, volumes(2, 2)),
    series(18, numbered(18), 5, volumes(16, 4)),
  ];
}
