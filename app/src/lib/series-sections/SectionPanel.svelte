<script lang="ts">
  import type { Snippet } from "svelte";

  import type {
    BookSection,
    SeriesBook,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInBook } from "#lib/series/series-stand-ins.ts";

  import type { ListedBooks } from "./listed-books";
  import SectionCovers from "./SectionCovers.svelte";
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
    books,
    usesStandIns,
    children,
  }: {
    section: BookSection | undefined;
    noted: BookSection | undefined;
    view: SectionView;
    series: NotedSeries;
    direction: SortDirection;
    books: ListedBooks | undefined;
    usesStandIns: boolean;
    children: Snippet;
  } = $props();

  function tilesOf(listed: readonly SeriesBook[], isComplete: boolean) {
    const shown = usesStandIns ? listed.map(standInBook) : listed;
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
  <SectionCovers
    tiles={tilesOf(books.list.items, books.list.isComplete)}
    label={SECTION_NAMES[section]()}
    isComplete={books.list.isComplete}
    onNearEnd={() => {
      void books.loadMore();
    }}
    {usesStandIns}
  />
{/if}
