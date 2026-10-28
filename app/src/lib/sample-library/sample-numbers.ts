import type {
  BookKind,
  BookSection,
  NumberRange,
  SeriesSection,
} from "#lib/ipc/bindings.ts";

export interface SampleNumbering {
  readonly kind: BookKind | null;
  readonly numbers: NumberRange | null;
  readonly volume: number | null;
  readonly section: BookSection | null;
}

const NUMBERED_TITLE = /^(?<marker>Volume|Chapter) (?<number>\d+)/u;
const SECTION_OF_KIND = {
  volume: "volumes",
  chapter: "chapters",
} as const satisfies Record<string, BookSection>;
const SECTIONS_IN_ORDER: readonly BookSection[] = [
  "volumes",
  "chapters",
  "specials",
];
const NOT_PLACED: SampleNumbering = {
  kind: null,
  numbers: null,
  volume: null,
  section: null,
};

export function numberingOf(title: string): SampleNumbering {
  const groups = NUMBERED_TITLE.exec(title)?.groups;
  if (groups?.marker === undefined || groups.number === undefined) {
    return NOT_PLACED;
  }
  const kind = groups.marker === "Volume" ? "volume" : "chapter";
  const number = Number(groups.number);
  return {
    kind,
    numbers: { first: number, last: number },
    volume: null,
    section: SECTION_OF_KIND[kind],
  };
}

export function isListedIn(
  section: BookSection | null | undefined,
  book: SampleNumbering,
): boolean {
  return section === undefined || section === null || section === book.section;
}

export function isFiledInVolume(
  volume: number | null | undefined,
  book: SampleNumbering,
): boolean {
  return (
    volume === undefined ||
    volume === null ||
    (book.kind === "chapter" && book.volume === volume)
  );
}

export function sectionsOf(books: readonly SampleNumbering[]): SeriesSection[] {
  return SECTIONS_IN_ORDER.map((section) => ({
    section,
    bookCount: books.filter((book) => book.section === section).length,
  })).filter(({ bookCount }) => bookCount > 0);
}

export function missingVolumes(
  books: readonly SampleNumbering[],
): NumberRange[] {
  const present = new Set(
    books.flatMap((book) =>
      book.kind === "volume" && book.numbers !== null
        ? [book.numbers.first]
        : [],
    ),
  );
  const highest = Math.max(0, ...present);
  const missing: NumberRange[] = [];
  for (let volume = present.has(0) ? 0 : 1; volume <= highest; volume += 1) {
    if (present.has(volume)) {
      continue;
    }
    const run = missing.at(-1);
    if (run?.last === volume - 1) {
      missing[missing.length - 1] = { first: run.first, last: volume };
    } else {
      missing.push({ first: volume, last: volume });
    }
  }
  return missing;
}

export function lastVolume(books: readonly SampleNumbering[]): number | null {
  const volumes = books.flatMap((book) =>
    book.kind === "volume" && book.numbers !== null ? [book.numbers.last] : [],
  );
  return volumes.length === 0 ? null : Math.max(...volumes);
}
