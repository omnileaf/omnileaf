import type {
  ChapterVolume,
  NumberRange,
  SeriesBook,
  SortDirection,
} from "#lib/ipc/bindings.ts";

export type SectionTile =
  | { readonly kind: "book"; readonly book: SeriesBook }
  | {
      readonly kind: "volume";
      readonly volume: number;
      readonly chapters: readonly [SeriesBook, ...SeriesBook[]];
      readonly counts: ChapterVolume | undefined;
    }
  | { readonly kind: "gap"; readonly missing: NumberRange };

export type PickKey = SeriesBook["id"] | `volume-${string}`;

export interface GapPlacing {
  readonly missing: readonly NumberRange[];
  readonly direction: SortDirection;
  readonly isComplete: boolean;
}

interface GapOrder {
  readonly sorted: (missing: readonly NumberRange[]) => NumberRange[];
  readonly comesBefore: (missing: NumberRange, volume: number) => boolean;
}

const GAP_ORDERS = {
  ascending: {
    sorted: (missing) => missing.toSorted((a, b) => a.first - b.first),
    comesBefore: (missing, volume) => missing.first < volume,
  },
  descending: {
    sorted: (missing) => missing.toSorted((a, b) => b.first - a.first),
    comesBefore: (missing, volume) => volume <= missing.first,
  },
} satisfies Record<SortDirection, GapOrder>;

function bookTile(book: SeriesBook): SectionTile {
  return { kind: "book", book };
}

function gapTile(missing: NumberRange): SectionTile {
  return { kind: "gap", missing };
}

function placingVolume(book: SeriesBook): number | undefined {
  switch (book.kind) {
    case "volume":
      return book.numbers?.first;
    case "chapter":
      return book.volume ?? undefined;
    case "special":
    case null:
      return undefined;
  }
}

export function booksOnly(
  books: readonly SeriesBook[],
): readonly SectionTile[] {
  return books.map(bookTile);
}

export function withGaps(
  books: readonly SeriesBook[],
  placing: GapPlacing,
): readonly SectionTile[] {
  const order = GAP_ORDERS[placing.direction];
  const waiting = order.sorted(placing.missing);
  const tiles: SectionTile[] = [];
  for (const book of books) {
    const volume = placingVolume(book);
    while (
      volume !== undefined &&
      waiting[0] !== undefined &&
      order.comesBefore(waiting[0], volume)
    ) {
      tiles.push(gapTile(waiting[0]));
      waiting.shift();
    }
    tiles.push(bookTile(book));
  }
  return placing.isComplete ? [...tiles, ...waiting.map(gapTile)] : tiles;
}

function filedVolume(book: SeriesBook): number | undefined {
  return book.kind === "chapter" ? (book.volume ?? undefined) : undefined;
}

export function volumeKey(volume: number): PickKey {
  return `volume-${String(volume)}`;
}

export function withChapterVolumesFolded(
  tiles: readonly SectionTile[],
  counts: readonly ChapterVolume[],
): readonly SectionTile[] {
  const folded: SectionTile[] = [];
  let chapters: [SeriesBook, ...SeriesBook[]] | undefined;
  for (const tile of tiles) {
    const volume = tile.kind === "book" ? filedVolume(tile.book) : undefined;
    const last = folded.at(-1);
    if (tile.kind !== "book" || volume === undefined) {
      folded.push(tile);
    } else if (
      chapters !== undefined &&
      last?.kind === "volume" &&
      last.volume === volume
    ) {
      chapters.push(tile.book);
    } else {
      chapters = [tile.book];
      folded.push({
        kind: "volume",
        volume,
        chapters,
        counts: counts.find((counted) => counted.volume === volume),
      });
    }
  }
  return folded;
}

export function pickKeyOf(tile: SectionTile): PickKey | undefined {
  switch (tile.kind) {
    case "book":
      return tile.book.id;
    case "volume":
      return volumeKey(tile.volume);
    case "gap":
      return undefined;
  }
}

export function pickKeysOf(tiles: readonly SectionTile[]): readonly PickKey[] {
  return tiles.flatMap((tile) => pickKeyOf(tile) ?? []);
}

export function booksPicked(
  tiles: readonly SectionTile[],
  isPicked: (key: PickKey) => boolean,
): SeriesBook["id"][] {
  return tiles.flatMap((tile) => {
    switch (tile.kind) {
      case "book":
        return isPicked(tile.book.id) ? [tile.book.id] : [];
      case "volume":
        return isPicked(volumeKey(tile.volume))
          ? tile.chapters.map(({ id }) => id)
          : [];
      case "gap":
        return [];
    }
  });
}

export function tileKey(tile: SectionTile): string {
  switch (tile.kind) {
    case "book":
      return tile.book.id;
    case "volume":
      return volumeKey(tile.volume);
    case "gap":
      return `gap-${String(tile.missing.first)}`;
  }
}
