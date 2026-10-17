<script lang="ts">
  import {
    Eye,
    FolderOpen,
    LibraryBig,
    Play,
    SquareCheck,
    Tags,
  } from "@lucide/svelte";
  import { ContextMenu } from "bits-ui";
  import type { Snippet } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";
  import type { ClassValue } from "svelte/elements";

  import {
    type AdultTreatment,
    COVERS_PER_ROW,
    DEFAULT_LIBRARY_VIEW,
    type LibraryDisplay,
    type LibrarySeries,
    type LibraryView,
  } from "#lib/ipc/bindings.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "#lib/components/ui/context-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    columnsOf,
    movedTo,
    type Reveal,
  } from "#lib/virtual-grid/grid-keys.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import CoverBadges from "./CoverBadges.svelte";
  import ContinueDisc from "./ContinueDisc.svelte";
  import AdultVeil from "./AdultVeil.svelte";
  import CoverImage from "./CoverImage.svelte";
  import DownloadedMark from "./DownloadedMark.svelte";
  import LanguageBadge from "./LanguageBadge.svelte";
  import { DragSelect } from "./drag-select.svelte";
  import ListCover from "./ListCover.svelte";
  import type { SeriesId } from "#lib/series/series-id.ts";
  import type { SeriesMenuActions } from "./series-menu";
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
    total,
    onNearEnd,
    onColumns,
    onMostThatFit,
    coverUrl,
    view,
    usesStandIns,
    menu,
    adultTreatment = "show",
  }: {
    series: readonly LibrarySeries[];
    isComplete: boolean;
    total?: number | undefined;
    onNearEnd?: () => void;
    onColumns?: (columns: number) => void;
    onMostThatFit?: (most: number) => void;
    coverUrl: CoverUrl;
    view: LibraryView;
    usesStandIns: boolean;
    menu?: SeriesMenuActions;
    adultTreatment?: AdultTreatment;
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
  const dragSelect =
    selection === undefined
      ? undefined
      : new DragSelect(
          selection,
          (cell) => series.find(({ id }) => id === cell.dataset.seriesId)?.id,
        );

  const revealed = new SvelteSet<SeriesId>();

  function isVeiled(one: LibrarySeries): boolean {
    return adultTreatment === "blur" && one.isAdult && !revealed.has(one.id);
  }

  function revealing(one: LibrarySeries, title: string) {
    return isVeiled(one)
      ? {
          role: "button",
          "aria-label": m.library_show_adult_cover({ title }),
          onclick: (event: MouseEvent) => {
            event.preventDefault();
            revealed.add(one.id);
          },
        }
      : {};
  }

  const MENU_ICON_SIZE = 16;
  let isMenuOpen = $state(false);
  let menuSeries = $state<LibrarySeries | undefined>();

  function pickedRing(one: LibrarySeries): ClassValue {
    if (selection?.has(one.id) === true) {
      return "outline-2 outline-offset-2 outline-foreground";
    }
    return isMenuOpen && menuSeries?.id === one.id
      ? "outline-2 outline-offset-2 outline-border"
      : "";
  }

  /** Opens the menu from the keyboard ourselves, since WebKit sends no contextmenu event for Shift F10 or the Menu key. */
  function openMenuFromKeys(event: KeyboardEvent): void {
    const isMenuKey =
      event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!isMenuKey || !(event.target instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const box = event.target.getBoundingClientRect();
    event.target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      }),
    );
  }

  let reveal: Reveal | undefined;

  async function moveAmongCovers(event: KeyboardEvent): Promise<void> {
    const link =
      event.target instanceof HTMLElement
        ? event.target.closest("[data-series-link]")
        : null;
    const item = link?.closest("[aria-posinset]");
    const list = item?.parentElement;
    if (
      item == null ||
      list == null ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const index = Number(item.getAttribute("aria-posinset")) - 1;
    const next = movedTo(event.key, index, {
      count: series.length,
      columns: columnsOf(list),
    });
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    if (next === index) {
      return;
    }
    const shown = await reveal?.(next);
    shown?.querySelector<HTMLElement>("[data-series-link]")?.focus();
  }

  function onCoverKeys(event: KeyboardEvent): void {
    openMenuFromKeys(event);
    void moveAmongCovers(event);
  }

  function noteMenuSeries(event: MouseEvent): void {
    const cell =
      event.target instanceof Element
        ? event.target.closest("[data-series-id]")
        : null;
    const id = cell?.getAttribute("data-series-id");
    menuSeries = series.find((one) => one.id === id);
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
  {@const veiled = isVeiled(one)}
  <div class="@container relative min-inline-none" data-series-id={one.id}>
    <Tooltip
      label={canHover.current && !isSelecting && cutOffTitles.has(one.id)
        ? shown.title
        : undefined}
    >
      {#snippet child({ props })}
        <SeriesLink
          {...props}
          {...revealing(one, shown.title)}
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
            <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
            {#if veiled}
              <AdultVeil onPointer={canHover.current} />
            {:else}
              <CoverBadges series={one} onCovers={view.onCovers} />
            {/if}
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
    {#if continues !== undefined && !isSelecting && !veiled}
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
  {@const veiled = isVeiled(one)}
  <div class="@container relative min-inline-none" data-series-id={one.id}>
    <SeriesLink
      {...revealing(one, shown.title)}
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
        <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
        {#if veiled}
          <AdultVeil onPointer={canHover.current} showsHint={false} />
        {:else}
          <CoverBadges series={one} onCovers={view.onCovers} />
        {/if}
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
    {#if continues !== undefined && !isSelecting && !veiled}
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
  {@const veiled = isVeiled(one)}
  <div class="@container relative min-inline-none" data-series-id={one.id}>
    <SeriesLink
      {...revealing(one, shown.title)}
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
        <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
        {#if veiled}
          <AdultVeil onPointer={canHover.current} />
        {:else}
          <CoverBadges series={one} onCovers={view.onCovers} />
        {/if}
        {#if isSelecting}
          <SelectionMark isOn={selection?.has(one.id) === true} />
        {/if}
        <p class="sr-only">{shown.title}</p>
      </div>
    </SeriesLink>
    {#if continues !== undefined && !isSelecting && !veiled}
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
  {@const share = readShare(one)}
  {@const continues = continuedBook(one)}
  {@const veiled = isVeiled(one)}
  <div
    class="flex items-center gap-xs border-be border-border"
    data-series-id={one.id}
  >
    <SeriesLink
      {...revealing(one, shown.title)}
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      class="flex flex-1 items-center gap-md rounded-control py-list-row-block min-inline-none"
    >
      {#if isSelecting}
        <span class="relative shrink-0 block-series-check inline-series-check">
          <SelectionMark isOn={selection?.has(one.id) === true} />
        </span>
      {/if}
      <span class="relative shrink-0">
        <ListCover
          cover={shown.cover}
          {coverUrl}
          isBlurred={veiled}
          class="rounded-list-cover inline-list-cover"
        />
        {#if view.onCovers.showsDownloaded && one.hasDownloads && !isSelecting && !veiled}
          <DownloadedMark class="absolute inset-e-xs inset-bs-xs" />
        {/if}
      </span>
      <span class="flex flex-col gap-xs min-inline-none">
        <span class="line-clamp-2 font-medium wrap-break-word">
          {shown.title}
        </span>
        <span class="flex flex-wrap items-center gap-sm">
          <span class="text-detail text-muted">
            {m.library_series_books({ count: one.bookCount })}
          </span>
          {#if view.onCovers.showsLanguage && one.language !== null && !veiled}
            <LanguageBadge language={one.language} class="bg-chip" />
          {/if}
          {#if view.onCovers.showsUnreadCount && !veiled}
            <UnreadCount
              count={one.unreadCount}
              isSpelledOut
              class="px-sm py-2xs text-caption"
            />
          {/if}
        </span>
        {#if share !== undefined}
          <Progress
            aria-label={m.library_books_read({
              read: one.bookCount - one.unreadCount,
              count: one.bookCount,
            })}
            value={share}
            class="block-xs inline-list-progress"
          />
        {/if}
      </span>
    </SeriesLink>
    {#if continues !== undefined && !isSelecting && !veiled}
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
<ContextMenu.Root bind:open={isMenuOpen}>
  <ContextMenu.Trigger
    disabled={menu === undefined || isSelecting || !canHover.current}
    class="contents"
    oncontextmenu={noteMenuSeries}
    onkeydown={onCoverKeys}
  >
    <div class="relative" {@attach dragSelect?.attach}>
      <VirtualGrid
        items={series}
        key={(one: LibrarySeries) => one.id}
        label={m.library_series_list()}
        {isComplete}
        {total}
        {...onNearEnd === undefined ? {} : { onNearEnd }}
        {...onColumns === undefined ? {} : { onColumns }}
        class={layout.list}
        style={coversPerRow}
        cell={layout.cell}
        onRevealReady={(ready: Reveal) => {
          reveal = ready;
        }}
      />
      {#if dragSelect?.box !== undefined}
        {@const box = dragSelect.box}
        <div
          data-drag-box
          aria-hidden="true"
          class="pointer-events-none absolute z-drag-box rounded-drag-box border border-accent bg-drag-box"
          style:left="{box.left}px"
          style:top="{box.top}px"
          style:width="{box.width}px"
          style:height="{box.height}px"
        ></div>
      {/if}
    </div>
  </ContextMenu.Trigger>
  {#if menu !== undefined && menuSeries !== undefined}
    {@const target = menuSeries}
    <ContextMenuContent to="main" class="min-inline-book-menu">
      {#if target.continuesFrom !== null}
        {@const book = target.continuesFrom}
        <ContextMenuItem
          onSelect={() => {
            void goto(resolve("/read/[book]", { book }));
          }}
        >
          <Play size={MENU_ICON_SIZE} aria-hidden="true" />
          {m.library_continue_reading()}
        </ContextMenuItem>
      {/if}
      <ContextMenuItem
        onSelect={() => {
          void goto(resolve("/(app)/series/[id]", { id: target.id }));
        }}
      >
        <LibraryBig size={MENU_ICON_SIZE} aria-hidden="true" />
        {m.library_open_series()}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          menu.onMarkRead(target);
        }}
      >
        <Eye size={MENU_ICON_SIZE} aria-hidden="true" />
        {m.library_mark_read()}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {#if menu.canLabel}
        <ContextMenuItem
          onSelect={() => {
            menu.onLabel(target);
          }}
        >
          <Tags size={MENU_ICON_SIZE} aria-hidden="true" />
          {m.library_labels_menu()}
        </ContextMenuItem>
      {/if}
      <ContextMenuItem
        onSelect={() => {
          menu.onSelect(target);
        }}
      >
        <SquareCheck size={MENU_ICON_SIZE} aria-hidden="true" />
        {m.library_select()}
      </ContextMenuItem>
      <ContextMenuSeparator class="touch:hidden" />
      <ContextMenuItem
        class="touch:hidden"
        onSelect={() => {
          menu.onShowInFolder(target);
        }}
      >
        <FolderOpen size={MENU_ICON_SIZE} aria-hidden="true" />
        {m.series_show_in_folder()}
      </ContextMenuItem>
    </ContextMenuContent>
  {/if}
</ContextMenu.Root>
