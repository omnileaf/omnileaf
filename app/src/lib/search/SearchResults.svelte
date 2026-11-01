<script lang="ts">
  import type { LibrarySeries, LibraryView } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { SCREEN_SIZES } from "#lib/library/library-view.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type { Reveal } from "#lib/virtual-grid/grid-keys.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import { matchedWords } from "./matched-words";
  import { searchLook } from "./search-look";

  let {
    series,
    count,
    isComplete,
    onNearEnd,
    coverUrl,
    usesStandIns,
    listId,
    activeKey,
    onRevealReady,
    onOpen,
    onSelect,
    words,
    view,
  }: {
    series: readonly LibrarySeries[];
    count: number | undefined;
    isComplete: boolean;
    onNearEnd: () => void;
    coverUrl: CoverUrl;
    usesStandIns: boolean;
    listId: string;
    activeKey: string | undefined;
    onRevealReady?: ((reveal: Reveal) => void) | undefined;
    onOpen: (series: LibrarySeries) => void;
    onSelect: (series: LibrarySeries) => void;
    words: string;
    view: LibraryView | undefined;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const phone = $derived(phoneOf(platform, width.current));
  const look = $derived(searchLook(platform, phone));
  const listbox = $derived(
    look.selectsOnClick
      ? { id: listId, activeKey, onChoose: onSelect, onActivate: onOpen }
      : { id: listId, activeKey, onChoose: onOpen },
  );
  const lookOf = $derived(usesStandIns ? standInLook : realLook);

  const headingId = $props.id();
  const locale = getLocale();
  const numbers = $derived(new Intl.NumberFormat(locale));
  const hasWords = $derived(words.trim() !== "");
  const coversTrack = $derived(
    view === undefined || view.fitsCoversToWidth
      ? look.coversFit
      : look.coversPerRow,
  );
  const coversPerRow = $derived(
    view === undefined
      ? undefined
      : SCREEN_SIZES.map(
          (size) =>
            `--${size}-covers-per-row: ${String(view.coversPerRow[size])}`,
        ).join("; "),
  );
</script>

{#snippet found(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const isChosen = one.id === activeKey}
  <ListCover
    cover={shown.cover}
    {coverUrl}
    class={[look.cover, isChosen && look.selectedCover]}
  />
  <div class="flex flex-col gap-2xs min-inline-none">
    <p class={[look.title, isChosen && look.selectedTitle]}>
      {#each matchedWords(shown.title, words, locale) as part, index (index)}
        {#if part.isMatch}
          <mark class={look.mark}>{part.text}</mark>
        {:else}
          {part.text}
        {/if}
      {/each}
    </p>
    {#if hasWords}
      <p class={look.line}>
        {m.search_matched_title()}
      </p>
    {/if}
    <p class={look.line}>
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

<section aria-labelledby={headingId} class={look.section}>
  <h2 id={headingId} class={look.heading}>
    {count === undefined
      ? m.quick_open_series()
      : m.search_series_heading({ count: numbers.format(count) })}
  </h2>
  <VirtualGrid
    {onRevealReady}
    items={series}
    key={(one: LibrarySeries) => one.id}
    label={m.search_results()}
    {isComplete}
    {onNearEnd}
    class={[look.grid, coversTrack]}
    {...coversPerRow === undefined ? {} : { style: coversPerRow }}
    itemClass={look.result}
    cell={found}
    {listbox}
  />
</section>
