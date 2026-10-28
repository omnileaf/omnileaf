import type {
  NumberRange,
  SeriesBook,
  SortDirection,
} from "#lib/ipc/bindings.ts";

export type SectionTile =
  | { readonly kind: "book"; readonly book: SeriesBook }
  | { readonly kind: "gap"; readonly missing: NumberRange };

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

export function bookIdsOf(
  tiles: readonly SectionTile[],
): readonly SeriesBook["id"][] {
  return tiles.flatMap((tile) => (tile.kind === "book" ? [tile.book.id] : []));
}

export function tileKey(tile: SectionTile): string {
  return tile.kind === "book"
    ? tile.book.id
    : `gap-${String(tile.missing.first)}`;
}
