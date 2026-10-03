<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import type {
    LibraryDisplay,
    LibrarySeries,
    LibraryView,
  } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";
  import VirtualGrid from "$lib/virtual-grid/VirtualGrid.svelte";

  import CoverBadges from "./CoverBadges.svelte";
  import CoverImage from "./CoverImage.svelte";
  import { coverLook } from "./cover-look";
  import type { CoverUrl } from "./cover-url";
  import UnreadCount from "./UnreadCount.svelte";

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

  interface DisplayLayout {
    readonly list: ClassValue;
    readonly item: string;
    readonly cell: Snippet<[LibrarySeries]>;
  }

  const look = $derived(coverLook(view.coversPerRow));

  const layout = $derived(
    (
      {
        grid: {
          list: ["grid-cols-covers-per-row", look.gap],
          item: "flex flex-col gap-cover-caption min-inline-none medium:gap-sm",
          cell: gridCell,
        },
        compact: {
          list: ["grid-cols-covers-per-row", look.gap],
          item: "min-inline-none",
          cell: compactCell,
        },
        list: {
          list: "grid-cols-1",
          item: "box-content flex items-center gap-cover-gap border-be border-border py-sm min-block-series-row large:gap-lg large:py-series-row-pad-wide large:min-block-series-row-wide",
          cell: listRow,
        },
      } satisfies Record<LibraryDisplay, DisplayLayout>
    )[view.display],
  );
</script>

{#snippet gridCell(one: LibrarySeries)}
  <div
    class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
  >
    <CoverImage cover={one.cover} {coverUrl} />
    <CoverBadges series={one} onCovers={view.onCovers} />
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
    <CoverBadges series={one} onCovers={view.onCovers} />
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
    class="relative box-content aspect-cover shrink-0 overflow-hidden rounded-list-cover border border-cover-edge bg-chip inline-list-cover large:inline-list-cover-wide"
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
  {#if view.onCovers.showsUnreadCount}
    <div class="flex shrink-0 justify-end large:inline-list-unread">
      <UnreadCount
        count={one.unreadCount}
        class="rounded-badge px-sm py-2xs text-caption"
      />
    </div>
  {/if}
{/snippet}

<div
  style:--phone-covers-per-row={String(view.coversPerRow.phone)}
  style:--tablet-covers-per-row={String(view.coversPerRow.tablet)}
  style:--desktop-covers-per-row={String(view.coversPerRow.desktop)}
>
  <VirtualGrid
    items={series}
    key={(one: LibrarySeries) => one.id}
    label={m.library_series_list()}
    {isComplete}
    {...onNearEnd === undefined ? {} : { onNearEnd }}
    class={layout.list}
    itemClass={layout.item}
    cell={layout.cell}
  />
</div>
