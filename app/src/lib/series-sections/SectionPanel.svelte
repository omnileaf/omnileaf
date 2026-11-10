<script lang="ts">
  import type { Snippet } from "svelte";

  import type {
    BookSection,
    BooksShown,
    ReadMark,
    SeriesBook,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { booksMatching } from "#lib/series/book-search.ts";
  import type { PhonePlatform } from "#lib/page/platform.ts";
  import NoShownBooks from "#lib/series/NoShownBooks.svelte";
  import { standInBook } from "#lib/series/series-stand-ins.ts";

  import { bookWords } from "./book-number-words";
  import type { ListedBooks } from "./listed-books";
  import PickedCovers from "./PickedCovers.svelte";
  import type { SectionView } from "./section-listing";
  import { SECTION_NAMES } from "./section-names";
  import type { NotedSeries } from "./section-note";
  import SectionNote from "./SectionNote.svelte";
  import { booksOnly, withGaps } from "./section-tiles";

  let {
    section,
    noted,
    view,
    series,
    direction,
    shown,
    search,
    books,
    usesStandIns,
    onMark,
    onPickedCount,
    children,
    phone,
    onClearSearch,
    onShowAll,
  }: {
    section: BookSection | undefined;
    noted: BookSection | undefined;
    view: SectionView;
    series: NotedSeries;
    direction: SortDirection;
    shown: BooksShown;
    search: string;
    books: ListedBooks | undefined;
    usesStandIns: boolean;
    onMark: (picked: SeriesBook["id"][], read: ReadMark) => Promise<boolean>;
    onPickedCount?: ((count: number | undefined) => void) | undefined;
    children: Snippet;
    phone: PhonePlatform | undefined;
    onClearSearch: () => void;
    onShowAll: () => void;
  } = $props();

  const isSearching = $derived(search.trim() !== "");

  function found(drawn: readonly SeriesBook[]): readonly SeriesBook[] {
    const named = drawn.map((book) => ({ book, title: bookWords(book) }));
    return booksMatching(named, search, getLocale()).map(({ book }) => book);
  }

  function tilesOf(listed: readonly SeriesBook[], isComplete: boolean) {
    const drawn = usesStandIns ? listed.map(standInBook) : listed;
    if (isSearching) {
      return booksOnly(found(drawn));
    }
    return section === "volumes" && shown === "all"
      ? withGaps(drawn, {
          missing: series.missingVolumes,
          direction,
          isComplete,
        })
      : booksOnly(drawn);
  }
</script>

{#if noted !== undefined}
  <SectionNote section={noted} {series} />
{/if}
{#if view === "books"}
  {#if books !== undefined}
    {@render children()}
  {/if}
{:else if books?.list.kind === "failed"}
  <p class="text-body text-muted">{m.series_books_failed()}</p>
{:else if books?.list.kind === "loaded" && section !== undefined}
  {@const tiles = tilesOf(books.list.items, books.list.isComplete)}
  {#if books.list.isComplete && tiles.length === 0 && (isSearching || shown !== "all")}
    <NoShownBooks {phone} {search} {shown} {onClearSearch} {onShowAll} />
  {/if}
  {#key section}
    <PickedCovers
      {tiles}
      label={SECTION_NAMES[section]()}
      isComplete={books.list.isComplete}
      onNearEnd={() => {
        void books.loadMore();
      }}
      {usesStandIns}
      {onMark}
      {onPickedCount}
      onLoadAll={() => books.loadAll()}
    />
  {/key}
{/if}
