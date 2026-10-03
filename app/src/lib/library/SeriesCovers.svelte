<script lang="ts">
  import type { LibrarySeries, LibraryView } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import VirtualGrid from "$lib/virtual-grid/VirtualGrid.svelte";

  import CoverImage from "./CoverImage.svelte";
  import { coverLook } from "./cover-look";
  import type { CoverUrl } from "./cover-url";

  let {
    series,
    isComplete,
    onNearEnd,
    coverUrl,
    view,
  }: {
    series: readonly LibrarySeries[];
    isComplete: boolean;
    onNearEnd?: () => void;
    coverUrl: CoverUrl;
    view: LibraryView;
  } = $props();

  const look = $derived(coverLook(view.coversPerRow));
</script>

{#snippet gridCell(one: LibrarySeries)}
  <div
    class="aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
  >
    <CoverImage cover={one.cover} {coverUrl} />
  </div>
  <div class="min-inline-none">
    <p class={["truncate font-semibold", look.title]}>{one.title}</p>
    <p class={["text-caption text-muted medium:mbs-2xs", look.bookCount]}>
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

{#snippet compactCell(one: LibrarySeries)}
  <div
    class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
  >
    <CoverImage cover={one.cover} {coverUrl} />
    <p
      class={[
        "absolute inset-x-none inset-be-none line-clamp-2 bg-band px-band pbs-band pbe-sm leading-band font-semibold text-on-band medium:px-band-wide medium:pbs-sm medium:pbe-band-wide medium:leading-band-wide",
        look.title,
      ]}
    >
      {one.title}
    </p>
  </div>
{/snippet}

{#snippet listRow(one: LibrarySeries)}
  <div
    class="box-content aspect-cover shrink-0 overflow-hidden rounded-list-cover border border-cover-edge bg-chip inline-list-cover large:inline-list-cover-wide"
  >
    <CoverImage cover={one.cover} {coverUrl} />
  </div>
  <div
    class="flex flex-1 flex-col gap-2xs min-inline-none large:flex-row large:items-center large:gap-lg"
  >
    <p class="truncate text-lead font-semibold large:flex-1">{one.title}</p>
    <p class="text-detail text-muted large:inline-list-detail">
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

<div
  style:--phone-covers-per-row={String(view.coversPerRow.phone)}
  style:--tablet-covers-per-row={String(view.coversPerRow.tablet)}
  style:--desktop-covers-per-row={String(view.coversPerRow.desktop)}
>
  {#if view.display === "list"}
    <VirtualGrid
      items={series}
      key={(one: LibrarySeries) => one.id}
      label={m.library_series_list()}
      {isComplete}
      {...onNearEnd === undefined ? {} : { onNearEnd }}
      class="grid-cols-1"
      itemClass="box-content flex items-center gap-cover-gap border-be border-border py-sm min-block-list-row large:gap-lg large:py-list-row-pad-wide large:min-block-list-row-wide"
      cell={listRow}
    />
  {:else}
    <VirtualGrid
      items={series}
      key={(one: LibrarySeries) => one.id}
      label={m.library_series_list()}
      {isComplete}
      {...onNearEnd === undefined ? {} : { onNearEnd }}
      class={["grid-cols-covers-per-row", look.gap]}
      itemClass={view.display === "grid"
        ? "flex flex-col gap-cover-caption min-inline-none medium:gap-sm"
        : "min-inline-none"}
      cell={view.display === "grid" ? gridCell : compactCell}
    />
  {/if}
</div>
