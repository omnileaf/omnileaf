<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { resolve } from "$app/paths";
  import type {
    LibraryDisplay,
    LibrarySeries,
    LibraryView,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import CoverBadges from "./CoverBadges.svelte";
  import CoverImage from "./CoverImage.svelte";
  import { coverLook } from "./cover-look";
  import { SCREEN_SIZES } from "./library-view";
  import type { CoverUrl } from "./cover-url";
  import { realLook, standInLook } from "./series-look";
  import UnreadCount from "./UnreadCount.svelte";

  let {
    series,
    isComplete,
    onNearEnd,
    onColumns,
    coverUrl,
    view,
    usesStandIns,
  }: {
    series: readonly LibrarySeries[];
    isComplete: boolean;
    onNearEnd?: () => void;
    onColumns?: (columns: number) => void;
    coverUrl: CoverUrl;
    view: LibraryView;
    usesStandIns: boolean;
  } = $props();

  interface DisplayLayout {
    readonly list: ClassValue;
    readonly cell: Snippet<[LibrarySeries]>;
  }

  const look = $derived(coverLook(view.coversPerRow));
  const lookOf = $derived(usesStandIns ? standInLook : realLook);

  const layout = $derived(
    (
      {
        grid: {
          list: ["grid-cols-covers-per-row", look.gap],
          cell: gridCell,
        },
        compact: {
          list: [
            "grid-cols-covers-per-row covers-fit-titles",
            look.gap,
            look.title,
          ],
          cell: compactCell,
        },
        covers: {
          list: ["grid-cols-covers-per-row", look.gap],
          cell: coversCell,
        },
        list: {
          list: "grid-cols-1",
          cell: listRow,
        },
      } satisfies Record<LibraryDisplay, DisplayLayout>
    )[view.display],
  );

  const coversPerRow = $derived(
    SCREEN_SIZES.map(
      (size) => `--${size}-covers-per-row: ${String(view.coversPerRow[size])}`,
    ).join("; "),
  );
</script>

{#snippet gridCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  <a
    href={resolve("/(app)/series/[id]", { id: one.id })}
    class="flex flex-col gap-cover-caption min-inline-none medium:gap-sm"
  >
    <div
      class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
    >
      <CoverImage cover={shown.cover} {coverUrl} />
      <CoverBadges series={one} onCovers={view.onCovers} />
    </div>
    <div class="min-inline-none">
      <p class={["truncate font-semibold", look.title]}>{shown.title}</p>
      <p
        class={[
          "truncate text-caption text-muted medium:mbs-2xs",
          look.bookCount,
        ]}
      >
        {m.library_series_books({ count: one.bookCount })}
      </p>
    </div>
  </a>
{/snippet}

{#snippet compactCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  <a
    href={resolve("/(app)/series/[id]", { id: one.id })}
    class="block min-inline-none"
  >
    <div
      class="@container relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
    >
      <CoverImage cover={shown.cover} {coverUrl} />
      <CoverBadges series={one} onCovers={view.onCovers} />
      <div
        class="absolute inset-x-none inset-be-none bg-linear-to-t from-band from-55% to-transparent px-band pbs-band-fade pbe-sm medium:px-band-wide medium:pbe-band-wide @max-cover-title:bg-none @max-cover-title-wide:px-band"
      >
        <p
          class="line-clamp-2 leading-band font-semibold wrap-anywhere text-on-band @max-cover-title:sr-only"
        >
          {shown.title}
        </p>
      </div>
    </div>
  </a>
{/snippet}

{#snippet coversCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  <a
    href={resolve("/(app)/series/[id]", { id: one.id })}
    class="block min-inline-none"
  >
    <div
      title={shown.title}
      class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
    >
      <CoverImage cover={shown.cover} {coverUrl} />
      <CoverBadges series={one} onCovers={view.onCovers} />
      <p class="sr-only">{shown.title}</p>
    </div>
  </a>
{/snippet}

{#snippet listRow(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  <a
    href={resolve("/(app)/series/[id]", { id: one.id })}
    class="box-content flex items-center gap-cover-gap border-be border-border py-sm min-block-series-row large:gap-lg large:py-series-row-pad-wide large:min-block-series-row-wide"
  >
    <div
      class="relative box-content aspect-cover shrink-0 overflow-hidden rounded-list-cover border border-cover-edge bg-chip inline-list-cover large:inline-list-cover-wide"
    >
      <CoverImage cover={shown.cover} {coverUrl} />
    </div>
    <div
      class="flex flex-1 flex-col gap-2xs min-inline-none large:flex-row large:items-center large:gap-lg"
    >
      <p class="truncate text-lead font-semibold large:flex-1">{shown.title}</p>
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
  </a>
{/snippet}

<VirtualGrid
  items={series}
  key={(one: LibrarySeries) => one.id}
  label={m.library_series_list()}
  {isComplete}
  {...onNearEnd === undefined ? {} : { onNearEnd }}
  {...onColumns === undefined ? {} : { onColumns }}
  class={layout.list}
  style={coversPerRow}
  cell={layout.cell}
/>
