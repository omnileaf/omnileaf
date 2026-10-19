<script lang="ts">
  import type { LibrarySeries, LibraryView } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { SCREEN_SIZES } from "#lib/library/library-view.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type { Reveal } from "#lib/virtual-grid/grid-keys.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import { matchedWords } from "./matched-words";

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
    words: string;
    view: LibraryView | undefined;
  } = $props();

  const lookOf = $derived(usesStandIns ? standInLook : realLook);

  const headingId = $props.id();
  const locale = getLocale();
  const numbers = $derived(new Intl.NumberFormat(locale));
  const hasWords = $derived(words.trim() !== "");
  const coversTrack = $derived(
    view === undefined || view.fitsCoversToWidth
      ? "large:grid-cols-covers-fit"
      : "large:grid-cols-covers-per-row",
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
  <ListCover
    cover={shown.cover}
    {coverUrl}
    class="rounded-result-cover inline-result-cover large:box-border large:rounded-cover large:inline-full"
  />
  <div class="flex flex-col gap-2xs min-inline-none">
    <p class="truncate text-lead font-semibold large:text-small">
      {#each matchedWords(shown.title, words, locale) as part, index (index)}
        {#if part.isMatch}
          <mark class="rounded-badge bg-chip text-foreground">{part.text}</mark>
        {:else}
          {part.text}
        {/if}
      {/each}
    </p>
    {#if hasWords}
      <p class="text-caption text-muted">{m.search_matched_title()}</p>
    {/if}
    <p class="text-caption text-muted">
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

<section
  aria-labelledby={headingId}
  class="flex flex-col gap-sm large:gap-label"
>
  <h2 id={headingId} class="font-semibold">
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
    class={[
      "grid-cols-1 gap-sm large:covers-gap-xl large:covers-row-gap-cover-row-wide",
      coversTrack,
    ]}
    {...coversPerRow === undefined ? {} : { style: coversPerRow }}
    itemClass="flex cursor-default items-center gap-md rounded-card min-inline-none aria-selected:bg-accent-soft large:flex-col large:items-stretch large:gap-sm large:rounded-cover large:aria-selected:bg-transparent large:aria-selected:outline-2 large:aria-selected:outline-offset-4 large:aria-selected:outline-accent"
    cell={found}
    listbox={{ id: listId, activeKey, onChoose: onOpen }}
  />
</section>
