<script lang="ts">
  import type { LibrarySeries } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import { realLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  let {
    series,
    count,
    isComplete,
    onNearEnd,
    coverUrl,
  }: {
    series: readonly LibrarySeries[];
    count: number | undefined;
    isComplete: boolean;
    onNearEnd: () => void;
    coverUrl: CoverUrl;
  } = $props();

  const headingId = $props.id();
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

{#snippet found(one: LibrarySeries)}
  {@const shown = realLook(one)}
  <div
    class="relative box-content aspect-cover shrink-0 overflow-hidden rounded-result-cover border border-cover-edge bg-chip inline-result-cover medium:inline-result-cover-wide"
  >
    <CoverImage cover={shown.cover} {coverUrl} />
  </div>
  <div class="flex flex-col gap-2xs min-inline-none">
    <p
      class="truncate text-lead font-semibold medium:text-small medium:font-bold"
    >
      {shown.title}
    </p>
    <p class="text-caption text-muted">
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

<section
  aria-labelledby={headingId}
  class="flex flex-col gap-sm large:gap-label"
>
  <h2
    id={headingId}
    class="text-detail font-bold tracking-heading-caps text-muted uppercase large:text-caption"
  >
    {count === undefined
      ? m.quick_open_series()
      : m.search_series_heading({ count: numbers.format(count) })}
  </h2>
  <p role="status" class="sr-only">
    {#if count !== undefined}
      {m.search_found({ count })}
    {/if}
  </p>
  <VirtualGrid
    items={series}
    key={(one: LibrarySeries) => one.id}
    label={m.search_results()}
    {isComplete}
    {onNearEnd}
    class="grid-cols-1 gap-sm medium:grid-cols-2 medium:gap-md large:grid-cols-3"
    itemClass="flex items-center gap-md min-inline-none medium:items-start medium:rounded-card medium:border medium:border-border medium:bg-card medium:p-result-card"
    cell={found}
  />
</section>
