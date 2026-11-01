<script lang="ts">
  import {
    Eye,
    FolderOpen,
    LibraryBig,
    Pencil,
    Play,
    SquareCheck,
    Tags,
    Trash,
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
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { showFolderLabel } from "#lib/page/show-file.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import CoverBadges from "./CoverBadges.svelte";
  import ContinueDisc from "./ContinueDisc.svelte";
  import AdultVeil from "./AdultVeil.svelte";
  import CoverImage from "./CoverImage.svelte";
  import CoverSheets from "./CoverSheets.svelte";
  import DownloadedMark from "./DownloadedMark.svelte";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import LanguageBadge from "./LanguageBadge.svelte";
  import { listRowLook } from "./list-row-look.ts";
  import DragBox from "./DragBox.svelte";
  import { DragSelect } from "./drag-select.svelte";
  import ListCover from "./ListCover.svelte";
  import type { SeriesId } from "#lib/series/series-id.ts";
  import { MENU_ICON_SIZE, type SeriesMenuActions } from "./series-menu";
  import PickedSeriesMenu from "./PickedSeriesMenu.svelte";
  import SelectionMark from "./SelectionMark.svelte";
  import TileCheck from "./TileCheck.svelte";
  import { seriesSelection } from "./series-selection";
  import SeriesLink from "./SeriesLink.svelte";
  import { coverLook } from "./cover-look";
  import { coverTileLook } from "./cover-tile";
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
  const platform = currentPlatform();
  const tile = coverTileLook(platform);
  const stack = $derived(view.stacksSeriesCovers ? tile.stack : null);
  const width = new WindowWidth();
  const rowLook = $derived(listRowLook(platform, width.current));
  const isIosPhone = $derived(
    platform === "ios" && isPhone(platform, width.current),
  );
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
  const marksPicks = $derived(isSelecting && platform !== "macos");
  const isMacTable = $derived(platform === "macos" && view.display === "list");
  const rowNumbers = $derived(
    new Map(series.map((one, index) => [one.id, index])),
  );
  const seriesOrder = () => series.map(({ id }) => id);
  const dragSelect =
    selection === undefined
      ? undefined
      : new DragSelect(selection, {
          cells: "[data-series-id]",
          idOf: (cell) =>
            series.find(({ id }) => id === cell.dataset.seriesId)?.id,
        });

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

  const namesFolderApp = platform === "windows" || platform === "macos";
  const showInFolderLabel = namesFolderApp
    ? showFolderLabel(platform)
    : m.series_show_in_folder();
  const removeLabel =
    platform === "macos"
      ? m.library_remove_from_library_ask()
      : m.library_remove_from_library();
  let isMenuOpen = $state(false);
  let menuSeries = $state<LibrarySeries | undefined>();
  const pickedMenu = $derived(
    menuSeries !== undefined &&
      selection !== undefined &&
      selection.count > 1 &&
      selection.has(menuSeries.id)
      ? menu?.picked
      : undefined,
  );

  function pickedRing(one: LibrarySeries): ClassValue {
    if (selection?.has(one.id) === true) {
      return tile.pickedRing;
    }
    return isMenuOpen && menuSeries?.id === one.id ? tile.menuTargetRing : "";
  }

  function pickedTitle(one: LibrarySeries): ClassValue {
    return selection?.has(one.id) === true ? tile.pickedTitle : "";
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
        ? event.target.closest("[data-pickable-link]")
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
    shown?.querySelector<HTMLElement>("[data-pickable-link]")?.focus();
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
    if (
      platform === "macos" &&
      menuSeries !== undefined &&
      selection?.isSelecting === true &&
      !selection.has(menuSeries.id)
    ) {
      selection.pickOnly([menuSeries.id]);
    }
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
  <div
    class={["@container relative wrap-normal min-inline-none", tile.cell]}
    data-series-id={one.id}
  >
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
          focusRing={tile.focusRing}
          class={[
            "flex flex-col gap-cover-caption min-inline-none medium:gap-sm",
            stack?.room,
            tile.link,
          ]}
        >
          <CoverSheets look={stack} bookCount={one.bookCount} />
          <div
            class={[
              "relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
              tile.cover,
              pickedRing(one),
            ]}
          >
            <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
            {#if veiled}
              <AdultVeil onPointer={canHover.current} />
            {:else}
              <CoverBadges series={one} onCovers={view.onCovers} />
            {/if}
            {#if marksPicks}
              <SelectionMark
                isOn={selection?.has(one.id) === true}
                class={tile.mark}
                onClass={tile.markOn}
                tickClass={tile.tick}
                offClass={tile.markOff}
              />
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
              class={[
                "line-clamp-2 font-medium wrap-break-word",
                look.title,
                pickedTitle(one),
              ]}
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
    <TileCheck id={one.id} title={shown.title} isVeiled={veiled} />
    {#if continues !== undefined && !isSelecting && !veiled}
      <ContinueDisc
        book={continues}
        series={shown.title}
        class={[
          "absolute inset-e-sm",
          stack?.continueAt ?? "inset-bs-cover-end",
          NARROW_DISC,
        ]}
      />
    {/if}
  </div>
{/snippet}

{#snippet compactCell(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  {@const continues = continuedBook(one)}
  {@const veiled = isVeiled(one)}
  <div
    class={["@container relative wrap-normal min-inline-none", tile.cell]}
    data-series-id={one.id}
  >
    <SeriesLink
      {...revealing(one, shown.title)}
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      focusRing={tile.focusRing}
      class={["block min-inline-none", stack?.room, tile.link]}
    >
      <CoverSheets look={stack} bookCount={one.bookCount} />
      <div
        class={[
          "@container relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
          tile.cover,
          pickedRing(one),
        ]}
      >
        <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
        {#if veiled}
          <AdultVeil onPointer={canHover.current} showsHint={false} />
        {:else}
          <CoverBadges series={one} onCovers={view.onCovers} />
        {/if}
        {#if marksPicks}
          <SelectionMark
            isOn={selection?.has(one.id) === true}
            class={tile.compactMark}
            onClass={tile.markOn}
            tickClass={tile.tick}
            offClass={tile.markOff}
          />
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
    <TileCheck id={one.id} title={shown.title} isVeiled={veiled} />
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
  <div
    class={["@container relative wrap-normal min-inline-none", tile.cell]}
    data-series-id={one.id}
  >
    <SeriesLink
      {...revealing(one, shown.title)}
      id={one.id}
      title={shown.title}
      order={seriesOrder}
      focusRing={tile.focusRing}
      class={["block min-inline-none", stack?.room, tile.link]}
    >
      <CoverSheets look={stack} bookCount={one.bookCount} />
      <div
        title={shown.title}
        class={[
          "relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip",
          tile.cover,
          pickedRing(one),
        ]}
      >
        <CoverImage cover={shown.cover} {coverUrl} isBlurred={veiled} />
        {#if veiled}
          <AdultVeil onPointer={canHover.current} />
        {:else}
          <CoverBadges series={one} onCovers={view.onCovers} />
        {/if}
        {#if marksPicks}
          <SelectionMark
            isOn={selection?.has(one.id) === true}
            class={tile.mark}
            onClass={tile.markOn}
            tickClass={tile.tick}
            offClass={tile.markOff}
          />
        {/if}
        <p class="sr-only">{shown.title}</p>
      </div>
    </SeriesLink>
    <TileCheck id={one.id} title={shown.title} isVeiled={veiled} />
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
  {#if isMacTable}
    <div
      data-series-id={one.id}
      class={[
        "grid grid-cols-mac-list items-center gap-md px-md min-block-list-cover",
        (rowNumbers.get(one.id) ?? 0) % 2 === 1 && "bg-hover",
      ]}
    >
      <SeriesLink
        {...revealing(one, shown.title)}
        id={one.id}
        title={shown.title}
        order={seriesOrder}
        class="flex items-center gap-md py-xs min-inline-none"
      >
        <ListCover
          cover={shown.cover}
          {coverUrl}
          isBlurred={isVeiled(one)}
          class="rounded-list-cover inline-list-cover"
        />
        <span data-slot="item-title" class="truncate">{shown.title}</span>
      </SeriesLink>
      <span data-list-cell="books" class="text-muted">{one.bookCount}</span>
      <span data-list-cell="unread" class="text-muted">
        {view.onCovers.showsUnreadCount && one.unreadCount > 0
          ? one.unreadCount
          : ""}
      </span>
      <span data-list-cell="language" class="text-muted">
        {view.onCovers.showsLanguage && one.language !== null
          ? one.language.toUpperCase()
          : ""}
      </span>
      <span data-list-cell="progress">
        {#if share !== undefined && view.onCovers.showsReadingProgress}
          <Progress
            aria-label={m.library_books_read({
              read: one.bookCount - one.unreadCount,
              count: one.bookCount,
            })}
            value={share}
            class="block-xs"
          />
        {/if}
      </span>
      {#if continues !== undefined && !isSelecting}
        <ContinueDisc
          book={continues}
          series={shown.title}
          class="shrink-0 bg-transparent text-foreground shadow-none hover:bg-hover"
        />
      {:else}
        <span></span>
      {/if}
    </div>
  {:else}
    {@const shown = lookOf(one)}
    {@const share = readShare(one)}
    {@const continues = continuedBook(one)}
    {@const veiled = isVeiled(one)}
    <div class={rowLook.row} data-series-id={one.id}>
      <SeriesLink
        {...revealing(one, shown.title)}
        id={one.id}
        title={shown.title}
        order={seriesOrder}
        class={rowLook.link}
      >
        {#if isSelecting}
          <span
            class="relative shrink-0 block-series-check inline-series-check"
          >
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
          {#if !isIosPhone && view.onCovers.showsDownloaded && one.hasDownloads && !isSelecting && !veiled}
            <DownloadedMark class="absolute inset-e-xs inset-bs-xs" />
          {/if}
        </span>
        {#if isIosPhone}
          <span class="flex flex-col min-inline-none">
            <span data-slot="item-title" class={rowLook.title}>
              {shown.title}
            </span>
            <span
              data-slot="item-subtitle"
              class="flex flex-wrap items-center gap-x-xs {rowLook.meta}"
            >
              {m.library_series_books({ count: one.bookCount })}
              {#if view.onCovers.showsLanguage && one.language !== null && !veiled}
                <span aria-hidden="true">·</span>
                {one.language.toUpperCase()}
              {/if}
              {#if view.onCovers.showsDownloaded && one.hasDownloads && !veiled}
                <span aria-hidden="true">·</span>
                <Icon name="download" class="shrink-0" />
              {/if}
              {#if view.onCovers.showsUnreadCount && one.unreadCount > 0 && !veiled}
                <span aria-hidden="true">·</span>
                <span class="font-semibold text-native-button-primary">
                  {m.library_unread_count({ count: one.unreadCount })}
                </span>
              {/if}
            </span>
          </span>
        {:else}
          <span class="flex flex-col gap-xs min-inline-none">
            <span data-slot="item-title" class={rowLook.title}>
              {shown.title}
            </span>
            <span class="flex flex-wrap items-center gap-sm">
              <span class={rowLook.meta}>
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
        {/if}
      </SeriesLink>
      {#if continues !== undefined && !isSelecting && !veiled}
        <ContinueDisc
          book={continues}
          series={shown.title}
          class="shrink-0 bg-transparent text-foreground shadow-none hover:bg-hover"
        />
      {/if}
    </div>
  {/if}
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
    disabled={menu === undefined ||
      (isSelecting && menu.picked === undefined) ||
      !canHover.current}
    class="contents"
    oncontextmenu={noteMenuSeries}
    onkeydown={onCoverKeys}
  >
    <div class="relative" {@attach dragSelect?.attach}>
      {#if isMacTable}
        <div
          aria-hidden="true"
          class="grid grid-cols-mac-list gap-md border-be border-border px-md py-xs text-caption font-semibold text-muted"
        >
          <span data-list-column></span>
          <span data-list-column>{m.library_list_books()}</span>
          <span data-list-column>{m.library_list_unread()}</span>
          <span data-list-column>{m.library_list_language()}</span>
          <span data-list-column>{m.library_list_progress()}</span>
          <span></span>
        </div>
      {/if}
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
        <DragBox box={dragSelect.box} />
      {/if}
    </div>
  </ContextMenu.Trigger>
  {#if menu !== undefined && menuSeries !== undefined && pickedMenu === undefined}
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
      {#if menu.canEditDetails}
        <ContextMenuItem
          onSelect={() => {
            menu.onEditDetails(target);
          }}
        >
          <Pencil size={MENU_ICON_SIZE} aria-hidden="true" />
          {m.edit_details_menu()}
        </ContextMenuItem>
      {/if}
      {#if platform !== "macos"}
        <ContextMenuItem
          onSelect={() => {
            menu.onSelect(target);
          }}
        >
          <SquareCheck size={MENU_ICON_SIZE} aria-hidden="true" />
          {m.library_select()}
        </ContextMenuItem>
      {/if}
      <ContextMenuSeparator class="touch:hidden" />
      <ContextMenuItem
        class="touch:hidden"
        onSelect={() => {
          menu.onShowInFolder(target);
        }}
      >
        <FolderOpen size={MENU_ICON_SIZE} aria-hidden="true" />
        {showInFolderLabel}
      </ContextMenuItem>
      {#if menu.onRemove !== undefined}
        {@const remove = menu.onRemove}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            remove(target);
          }}
        >
          <Trash size={MENU_ICON_SIZE} aria-hidden="true" />
          {removeLabel}
        </ContextMenuItem>
      {/if}
    </ContextMenuContent>
  {/if}
  {#if pickedMenu !== undefined && selection !== undefined}
    <PickedSeriesMenu
      actions={pickedMenu}
      count={selection.count}
      canLabel={menu?.canLabel === true}
      {showInFolderLabel}
    />
  {/if}
</ContextMenu.Root>
