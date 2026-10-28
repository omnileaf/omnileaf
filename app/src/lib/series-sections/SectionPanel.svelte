<script lang="ts">
  import type { Snippet } from "svelte";

  import type {
    BookSection,
    ReadMark,
    SeriesBook,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { booksMatching } from "#lib/series/book-search.ts";
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
    search,
    books,
    usesStandIns,
    onMark,
    children,
  }: {
    section: BookSection | undefined;
    noted: BookSection | undefined;
    view: SectionView;
    series: NotedSeries;
    direction: SortDirection;
    search: string;
    books: ListedBooks | undefined;
    usesStandIns: boolean;
    onMark: (picked: SeriesBook["id"][], read: ReadMark) => Promise<boolean>;
    children: Snippet;
  } = $props();

  const isSearching = $derived(search.trim() !== "");

  function found(shown: readonly SeriesBook[]): readonly SeriesBook[] {
    const named = shown.map((book) => ({ book, title: bookWords(book) }));
    return booksMatching(named, search, getLocale()).map(({ book }) => book);
  }

  function tilesOf(listed: readonly SeriesBook[], isComplete: boolean) {
    const shown = usesStandIns ? listed.map(standInBook) : listed;
    if (isSearching) {
      return booksOnly(found(shown));
    }
    return section === "volumes"
      ? withGaps(shown, {
          missing: series.missingVolumes,
          direction,
          isComplete,
        })
      : booksOnly(shown);
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
  {#if isSearching && books.list.isComplete && tiles.length === 0}
    <p class="text-body">{m.series_no_match({ search: search.trim() })}</p>
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
    />
  {/key}
{/if}
