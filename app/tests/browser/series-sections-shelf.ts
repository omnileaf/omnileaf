import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND } from "./fixtures.ts";
import {
  ADDED_AT_MS,
  SERIES_FOLDER,
  SERIES_ID,
  SERIES_TITLE,
  type WireBook,
} from "./series-shelf.ts";

type WireRange = NonNullable<WireBook["numbers"]>;
type WireReading = WireBook["reading"];
type WireOverview = Awaited<ReturnType<FakeBackend["seriesOverview"]>>;
type WireSection = WireOverview["sections"][number];

export interface ShelvedBook {
  readonly kind: NonNullable<WireBook["kind"]>;
  readonly numbers?: WireRange;
  readonly volume?: number;
  readonly title?: string;
  readonly reading?: WireReading;
}

const PAGES = 190;
const SECTION_OF = {
  volume: "volumes",
  chapter: "chapters",
  special: "specials",
} as const;

function sectionOf(book: ShelvedBook): NonNullable<WireBook["section"]> {
  return book.kind === "chapter" && book.volume !== undefined
    ? "volumes"
    : SECTION_OF[book.kind];
}

function readInVolume(book: WireBook): number | null {
  return book.kind === "volume" ? (book.numbers?.last ?? null) : book.volume;
}

function fileName(book: ShelvedBook): string {
  const first = String(book.numbers?.first ?? 0).padStart(2, "0");
  return book.title ?? `${SERIES_TITLE} ${book.kind} ${first}.cbz`;
}

export function volumes(...numbers: readonly number[]): ShelvedBook[] {
  return numbers.map((first) => ({
    kind: "volume",
    numbers: { first, last: first },
  }));
}

export function chapters(...numbers: readonly number[]): ShelvedBook[] {
  return numbers.map((first) => ({
    kind: "chapter",
    numbers: { first, last: first },
  }));
}

export class SectionShelf {
  #books: WireBook[];
  readonly #missing: readonly WireRange[];
  readonly listings: { readonly section: string | null | undefined }[] = [];

  constructor(
    books: readonly ShelvedBook[],
    missing: readonly WireRange[] = [],
  ) {
    this.#missing = missing;
    this.#books = books.map((book, index) => ({
      id: `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      title: fileName(book),
      cover: null,
      addedAtMs: ADDED_AT_MS,
      reading: book.reading ?? { state: "notStarted" },
      pageCount: PAGES,
      isBookmarked: false,
      isNew: false,
      isFileMissing: false,
      kind: book.kind,
      numbers: book.numbers ?? null,
      volume: book.volume ?? null,
      section: sectionOf(book),
    }));
  }

  drop(section: NonNullable<WireBook["section"]>): void {
    this.#books = this.#books.filter((book) => book.section !== section);
  }

  #sections(): WireSection[] {
    const order = ["volumes", "chapters", "specials"] as const;
    return order
      .map((section) => ({
        section,
        bookCount: this.#books.filter((book) => book.section === section)
          .length,
      }))
      .filter(({ bookCount }) => bookCount > 0);
  }

  #lastVolume(): number | null {
    const volumes = this.#books
      .map(readInVolume)
      .filter((volume) => volume !== null);
    return volumes.length === 0 ? null : Math.max(...volumes);
  }

  backend(): FakeBackend {
    return {
      ...DEFAULT_BACKEND,
      seriesOverview: (id) => {
        if (id !== SERIES_ID) {
          return DEFAULT_BACKEND.seriesOverview(id);
        }
        return {
          id: SERIES_ID,
          title: SERIES_TITLE,
          year: null,
          bookCount: this.#books.length,
          readCount: this.#books.filter((book) => book.reading.state === "read")
            .length,
          bookmarkCount: 0,
          cover: null,
          folder: SERIES_FOLDER,
          upNext: null,
          format: null,
          creators: [],
          summary: null,
          tags: [],
          related: [],
          secondsLeft: null,
          sections: this.#sections(),
          missingVolumes: [...this.#missing],
          lastVolume: this.#lastVolume(),
        };
      },
      seriesBooks: (id, listing) => {
        this.listings.push({ section: listing.section });
        const inSection = this.#books.filter(
          (book) => listing.section == null || book.section === listing.section,
        );
        const shown = inSection.filter(
          (book) => listing.shown !== "unread" || book.reading.state !== "read",
        );
        const ordered =
          listing.direction === "descending" ? shown.toReversed() : shown;
        return { books: id === SERIES_ID ? ordered : [], next: null };
      },
    };
  }
}
