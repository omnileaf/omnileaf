<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";
  import type { ClassValue } from "svelte/elements";

  import {
    COVERS_PER_ROW,
    DEFAULT_LIBRARY_VIEW,
    type LibraryDisplay,
    type LibrarySeries,
    type LibraryView,
  } from "#lib/ipc/bindings.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { columnsOf } from "#lib/virtual-grid/grid-keys.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import CoverBadges from "./CoverBadges.svelte";
  import ContinueDisc from "./ContinueDisc.svelte";
  import CoverImage from "./CoverImage.svelte";
  import ListCover from "./ListCover.svelte";
  import SelectionMark from "./SelectionMark.svelte";
  import { seriesSelection } from "./series-selection";
  import SeriesLink from "./SeriesLink.svelte";
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
    onMostThatFit,
    coverUrl,
    view,
    usesStandIns,
  }: {
    series: readonly LibrarySeries[];
    isComplete: boolean;
    onNearEnd?: () => void;
    onColumns?: (columns: number) => void;
    onMostThatFit?: (most: number) => void;
    coverUrl: CoverUrl;
    view: LibraryView;
    usesStandIns: boolean;
  } = $props();

  interface DisplayLayout {
    readonly list: ClassValue;
    readonly cell: Snippet<[LibrarySeries]>;
  }

  const fitsToWidth = $derived(view.fitsCoversToWidth);
  const look = $derived(
    coverLook(
      fitsToWidth ? DEFAULT_LIBRARY_VIEW.coversPerRow : view.coversPerRow,
    ),
  );
  const baseLook = coverLook(DEFAULT_LIBRARY_VIEW.coversPerRow);
  const coversTrack = $derived(
    fitsToWidth ? "grid-cols-covers-fit" : "grid-cols-covers-per-row",
  );
  const mostCoversPerRow = SCREEN_SIZES.map(
    (size) => `--${size}-covers-per-row: ${String(COVERS_PER_ROW[size].most)}`,
  ).join("; ");
  const lookOf = $derived(usesStandIns ? standInLook : realLook);
  const canHover = new MediaQuery("(hover: hover)");
  const selection = seriesSelection();
  const isSelecting = $derived(selection?.isSelecting === true);
  const seriesOrder = () => series.map(({ id }) => id);

  function pickedRing(one: LibrarySeries): ClassValue {
    return selection?.has(one.id) === true
      ? "outline-2 outline-offset-2 outline-foreground"
      : "";
  }
  const cutOffTitles = new SvelteSet<string>();

  function notesCutOff(id: string): (title: HTMLElement) => () => void {
    return (title) => {
      const note = () => {
        if (title.scrollHeight > title.clientHeight) {
          cutOffTitles.add(id);
        } else {
          cutOffTitles.delete(id);
        }
      };
      const observer = new ResizeObserver(note);
      observer.observe(title);
      return () => {
        observer.disconnect();
        cutOffTitles.delete(id);
      };
    };
  }

  const layout = $derived(
    (
      {
        grid: {
          list: [coversTrack, look.gap],
          cell: gridCell,
        },
        compact: {
          list: [coversTrack, "covers-fit-titles", look.gap, look.title],
          cell: compactCell,
        },
        covers: {
          list: [coversTrack, look.gap],
          cell: coversCell,
        },
        list: {
          list: "grid-cols-1",
          cell: listRow,
        },
      } satisfies Record<LibraryDisplay, DisplayLayout>
    )[view.display],
  );

  const PERCENT = 100;
  const NARROW_DISC =
    "@max-cover-disc:continue-disc-small @max-cover-continue:hidden";

  function continuedBook(one: LibrarySeries): string | undefined {
    return view.onCovers.showsContinueButton && one.continuesFrom !== null
      ? one.continuesFrom
      : undefined;
  }

  function reportsMostThatFit(report: (most: number) => void) {
    return (probe: HTMLElement) => {
      let reported: number | undefined;
      const watching = new ResizeObserver(() => {
        const most = columnsOf(probe);
        if (most !== reported) {
          reported = most;
          report(most);
        }
      });
      watching.observe(probe);
      return () => {
        watching.disconnect();
      };
    };
  }

  function readShare(one: LibrarySeries): number | undefined {
    const read = one.bookCount - one.unreadCount;
    return view.onCovers.showsReadingProgress &&
      read > 0 &&
      read < one.bookCount
      ? Math.round((read / one.bookCount) * PERCENT)
      : undefined;
  }

  const coversPerRow = $derived(
    SCREEN_SIZES.map(
      (size) => `--${size}-covers-per-row: ${String(view.coversPerRow[size])}`,
    ).join("; "),
  );
</script>

{#snippet gridCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const share = readShare(one)}
  {@const continues = continuedBook(one)}
  <div class="@container relative min-inline-none">
    <Tooltip
      label={canHover.current && !isSelecting && cutOffTitles.has(one.id)
        ? shown.title
        : undefined}
    >
      {#snippet child({ props })}
        <SeriesLink
          {...props}
          id={one.id}
          title={shown.title}
          order={seriesOrder}
          class="flex flex-col gap-cover-caption min-inline-none medium:gap-sm"
        >
          <div
            class={[
              "relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
              pickedRing(one),
            ]}
          >
            <CoverImage cover={shown.cover} {coverUrl} />
            <CoverBadges series={one} onCovers={view.onCovers} />
            {#if isSelecting}
              <SelectionMark isOn={selection?.has(one.id) === true} />
            {/if}
          </div>
          {#if share !== undefined}
            <Progress
              aria-label={m.library_books_read({
                read: one.bookCount - one.unreadCount,
                count: one.bookCount,
              })}
              value={share}
              class="block-xs"
            />
          {/if}
          <div class="min-inline-none">
            <p
              {@attach notesCutOff(one.id)}
              class={["line-clamp-2 font-medium wrap-break-word", look.title]}
            >
              {shown.title}
            </p>
            <p
              class={[
                "truncate text-caption text-muted medium:mbs-2xs",
                look.bookCount,
              ]}
            >
              {m.library_series_books({ count: one.bookCount })}
            </p>
          </div>
        </SeriesLink>
      {/snippet}
    </Tooltip>
    {#if continues !== undefined && !isSelecting}
      <ContinueDisc
        book={continues}
        series={shown.title}
        class={["absolute inset-e-sm inset-bs-cover-end", NARROW_DISC]}
      />
    {/if}
  </div>
{/snippet}

{#snippet compactCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const continues = continuedBook(one)}
  <div class="@container relative min-inline-none">
    <SeriesLink
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      class="block min-inline-none"
    >
      <div
        class={[
          "@container relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
          pickedRing(one),
        ]}
      >
        <CoverImage cover={shown.cover} {coverUrl} />
        <CoverBadges series={one} onCovers={view.onCovers} />
        {#if isSelecting}
          <SelectionMark isOn={selection?.has(one.id) === true} />
        {/if}
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
    </SeriesLink>
    {#if continues !== undefined && !isSelecting}
      <ContinueDisc
        book={continues}
        series={shown.title}
        class={[
          "absolute inset-e-sm inset-be-compact-continue-lift",
          NARROW_DISC,
        ]}
      />
    {/if}
  </div>
{/snippet}

{#snippet coversCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const continues = continuedBook(one)}
  <div class="@container relative min-inline-none">
    <SeriesLink
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      class="block min-inline-none"
    >
      <div
        title={shown.title}
        class={[
          "relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
          pickedRing(one),
        ]}
      >
        <CoverImage cover={shown.cover} {coverUrl} />
        <CoverBadges series={one} onCovers={view.onCovers} />
        {#if isSelecting}
          <SelectionMark isOn={selection?.has(one.id) === true} />
        {/if}
        <p class="sr-only">{shown.title}</p>
      </div>
    </SeriesLink>
    {#if continues !== undefined && !isSelecting}
      <ContinueDisc
        book={continues}
        series={shown.title}
        class={["absolute inset-e-sm inset-be-sm", NARROW_DISC]}
      />
    {/if}
  </div>
{/snippet}

{#snippet listRow(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const continues = continuedBook(one)}
  <div class="flex items-center gap-sm border-be border-border">
    <SeriesLink
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      class="box-content flex flex-1 items-center gap-cover-gap py-sm min-block-series-row min-inline-none large:gap-lg large:py-series-row-pad-wide large:min-block-series-row-wide"
    >
      {#if isSelecting}
        <span class="relative shrink-0 block-series-check inline-series-check">
          <SelectionMark isOn={selection?.has(one.id) === true} />
        </span>
      {/if}
      <ListCover
        cover={shown.cover}
        {coverUrl}
        class="rounded-list-cover inline-list-cover large:inline-list-cover-wide"
      />
      <div
        class="flex flex-1 flex-col gap-2xs min-inline-none large:flex-row large:items-center large:gap-lg"
      >
        <p class="truncate text-lead font-semibold large:flex-1">
          {shown.title}
        </p>
        <p class="text-detail text-muted large:inline-list-detail">
          {m.library_series_books({ count: one.bookCount })}
        </p>
      </div>
      {#if view.onCovers.showsUnreadCount}
        <div class="flex shrink-0 justify-end large:inline-list-unread">
          <UnreadCount
            count={one.unreadCount}
            class="px-sm py-2xs text-caption"
          />
        </div>
      {/if}
    </SeriesLink>
    {#if continues !== undefined && !isSelecting}
      <ContinueDisc
        book={continues}
        series={shown.title}
        class="shrink-0 bg-transparent text-foreground shadow-none hover:bg-hover"
      />
    {/if}
  </div>
{/snippet}

{#if onMostThatFit !== undefined && view.display !== "list"}
  <div
    aria-hidden="true"
    style={mostCoversPerRow}
    class={[
      "invisible grid grid-cols-covers-per-row overflow-hidden block-none",
      view.display === "compact" && ["covers-fit-titles", baseLook.title],
      baseLook.gap,
    ]}
    {@attach reportsMostThatFit(onMostThatFit)}
  ></div>
{/if}
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
