import type {
  BookKind,
  BookSection,
  NumberRange,
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
