<script lang="ts">
  import { Eye, EyeOff, ListChecks } from "@lucide/svelte";
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { beforeNavigate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { LongPress } from "#lib/components/long-press.ts";
  import type {
    Platform,
    ReadMark,
    SeriesBook,
    SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { shortcut } from "#lib/shortcut.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import BookListingChoices from "./BookListingChoices.svelte";
  import BookRowText from "./BookRowText.svelte";
  import BookTable from "./BookTable.svelte";
  import { BookSelection } from "./book-selection.svelte";
  import SelectionBar from "./SelectionBar.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;
  const ICON_SIZE = 16;
  const ACTION_ICON_SIZE = 20;
  const MARKS = [
    { mark: "read", icon: Eye, label: m.series_mark_read },
    { mark: "unread", icon: EyeOff, label: m.series_mark_unread },
  ] as const;

  let {
    books,
    bookCount,
    listing,
    onListing,
    isComplete,
    onNearEnd,
    onLoadAll,
    onMark,
    platform,
  }: {
    books: readonly SeriesBook[];
    bookCount: number;
    listing: SeriesBookListing;
    onListing: (listing: SeriesBookListing) => void;
    isComplete: boolean;
    onNearEnd: () => void;
    onLoadAll: () => Promise<void>;
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
    platform: Platform;
  } = $props();

  type Outcome =
    | { readonly kind: "none" }
    | {
        readonly kind: "marked";
        readonly mark: ReadMark;
        readonly count: number;
      }
    | { readonly kind: "failed" }
    | { readonly kind: "pickedAll"; readonly count: number };

  const selection = new BookSelection<BookId>();
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const longPress = new LongPress(LONG_PRESS_MS);
  const headingId = $props.id();
  const dates = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }),
  );
  const ids = $derived(books.map((book) => book.id));

  let outcome: Outcome = $state({ kind: "none" });
  let section: HTMLElement | undefined = $state();
  let selectButton: HTMLElement | null = $state(null);
  let selectAllButton: HTMLElement | null = $state(null);
  let selectAllBox: HTMLElement | null = $state(null);

  const isPicking = $derived(selection.isSelecting || selection.count > 0);

  function pickRunOnShift(event: MouseEvent, book: SeriesBook): void {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(book.id, ids);
    }
  }

  function startPickingFrom(book: SeriesBook): void {
    outcome = { kind: "none" };
    selection.begin(book.id);
  }

  function releasePress(): void {
    longPress.released();
  }

  $effect(() => releasePress);

  async function begin(): Promise<void> {
    outcome = { kind: "none" };
    selection.begin();
    await tick();
    selectAllButton?.focus();
  }

  function isFocusHereOrLost(): boolean {
    const focused = document.activeElement;
    return (
      focused === null ||
      focused === document.body ||
      (section?.contains(focused) ?? false)
    );
  }

  async function end(): Promise<void> {
    const isFocusToKeep = isFocusHereOrLost();
    selection.end();
    if (isFocusToKeep) {
      await tick();
      (isWide.current ? selectAllBox : selectButton)?.focus();
    }
  }

  let isPickingAll = $state(false);

  async function pickAll(): Promise<void> {
    isPickingAll = true;
    try {
      await onLoadAll();
    } finally {
      isPickingAll = false;
    }
    selection.pickAll(ids);
    outcome = { kind: "pickedAll", count: selection.count };
  }

  async function markBooks(picked: BookId[], read: ReadMark): Promise<boolean> {
    const isMarked = await onMark(picked, read);
    outcome = isMarked
      ? { kind: "marked", mark: read, count: picked.length }
      : { kind: "failed" };
    return isMarked;
  }

  async function mark(read: ReadMark): Promise<void> {
    if (await markBooks(selection.picked, read)) {
      await end();
    }
  }

  function isFromDialog(event: Event): boolean {
    return (
      event.target instanceof Element &&
      event.target.closest(`[aria-modal="true"]`) !== null
    );
  }

  function endUnlessFromDialog(event: KeyboardEvent): void {
    if (!isFromDialog(event)) {
      void end();
    }
  }

  $effect(() =>
    takeBackWithinScreen(() => {
      if (!isPicking) {
        return false;
      }
      void end();
      return true;
    }),
  );

  beforeNavigate((navigation) => {
    if (navigation.type === "popstate" && navigation.delta < 0 && isPicking) {
      navigation.cancel();
      void end();
    }
  });

  function announced(shown: Outcome): string {
    switch (shown.kind) {
      case "none":
        return "";
      case "marked":
        return shown.mark === "read"
          ? m.series_marked_read({ count: shown.count })
          : m.series_marked_unread({ count: shown.count });
      case "failed":
        return m.series_mark_failed();
      case "pickedAll":
        return m.series_selected_count({ count: shown.count });
    }
  }
</script>

{#snippet row(book: SeriesBook)}
  {@const isPicked = selection.has(book.id)}
  {#if selection.isSelecting}
    <label
      class={[
        "flex cursor-pointer items-center gap-md min-block-book-row max-medium:ps-page-start max-medium:pe-md medium:px-lg expanded:gap-md expanded:px-md expanded:min-block-book-row-wide",
        isPicked && "bg-selected-row",
      ]}
    >
      <Checkbox
        bind:checked={
          () => isPicked,
          () => {
            selection.toggle(book.id);
          }
        }
        aria-label={m.series_select_book({ title: book.title })}
        class="rounded-series-check border-check-off block-series-check inline-series-check expanded:rounded-series-check-wide expanded:block-series-check-wide expanded:inline-series-check-wide"
        onclick={(event: MouseEvent) => {
          pickRunOnShift(event, book);
        }}
      />
      <BookRowText {book} {dates} />
    </label>
  {:else}
    <div
      role="presentation"
      class="flex items-center gap-md select-none min-block-book-row max-medium:ps-page-start max-medium:pe-md medium:px-lg expanded:px-md expanded:min-block-book-row-wide"
      onpointerdown={(event) => {
        longPress.pressed(event, () => {
          startPickingFrom(book);
        });
      }}
      onpointerup={releasePress}
      onpointercancel={releasePress}
      onpointerleave={releasePress}
      oncontextmenu={(event) => {
        event.preventDefault();
      }}
    >
      <a
        href={resolve("/read/[book]", { book: book.id })}
        draggable="false"
        class="flex flex-1 items-center self-stretch min-inline-none"
      >
        <BookRowText {book} {dates} />
      </a>
    </div>
  {/if}
{/snippet}

<svelte:window
  onpointerdowncapture={() => {
    longPress.pointerWentDown();
  }}
  onclickcapture={(event: MouseEvent) => {
    longPress.clicked(event);
  }}
  {@attach shortcut(
    ...(isPicking ? [{ key: "Escape", run: endUnlessFromDialog }] : []),
    ...(isWide.current
      ? [
          {
            key: "a",
            command: platform,
            run: () => {
              void pickAll();
            },
          },
        ]
      : []),
  )}
/>

<section
  bind:this={section}
  aria-labelledby={headingId}
  class="flex flex-col gap-sm"
>
  <div class="flex flex-wrap items-center gap-sm min-block-series-back">
    <h2 id={headingId} class="flex-1 text-series-heading font-bold">
      {selection.isSelecting
        ? m.series_selected_count({ count: selection.count })
        : m.series_books_heading({ count: bookCount })}
    </h2>
    {#if isWide.current}
      <span class="text-detail text-muted max-large:hidden">
        {m.series_select_range_hint()}
      </span>
    {:else if selection.isSelecting}
      <Button
        bind:ref={selectAllButton}
        type="button"
        look="outline"
        aria-busy={isPickingAll}
        class="px-md text-detail block-series-back"
        onclick={() => {
          void pickAll();
        }}
      >
        {m.series_select_all()}
      </Button>
      <Button
        type="button"
        look="filled"
        class="rounded-control px-md text-detail font-bold block-series-back"
        onclick={() => {
          void end();
        }}
      >
        {m.series_select_done()}
      </Button>
    {:else}
      <Button
        bind:ref={selectButton}
        type="button"
        look="outline"
        class="flex items-center gap-icon-gap px-md text-detail block-series-back"
        onclick={() => {
          void begin();
        }}
      >
        <ListChecks size={ICON_SIZE} aria-hidden="true" />
        {m.series_select()}
      </Button>
    {/if}
  </div>
  <BookListingChoices {listing} onChoose={onListing} />
  {#if isComplete && books.length === 0 && listing.shown === "unread"}
    <p class="text-body text-muted">{m.series_no_unread()}</p>
  {/if}
  {#if isWide.current}
    <BookTable
      bind:selectAllBox
      {books}
      {dates}
      {isComplete}
      {onNearEnd}
      {selection}
      {isPickingAll}
      onPickAll={() => {
        void pickAll();
      }}
      onClear={() => {
        void end();
      }}
      onMark={(picked: BookId[], read: ReadMark) => {
        void markBooks(picked, read);
      }}
    />
    {#if selection.count > 0}
      <SelectionBar
        count={selection.count}
        onMark={(read: ReadMark) => {
          void mark(read);
        }}
        onClear={() => {
          void end();
        }}
      />
    {/if}
  {:else}
    <div
      class="max-medium:-ms-page-start max-medium:-me-page-end medium:overflow-hidden medium:rounded-card medium:border medium:border-border medium:bg-card"
    >
      <VirtualGrid
        items={books}
        key={(book: SeriesBook) => book.id}
        label={m.series_books_list()}
        {isComplete}
        {onNearEnd}
        class="grid-cols-1"
        itemClass="border-be border-border last:max-medium:border-be-0 medium:last:border-be-0"
        cell={row}
      />
    </div>
    {#if selection.isSelecting && selection.count > 0}
      <div
        role="group"
        aria-label={m.series_selection_toolbar()}
        class="sticky inset-be-lg grid grid-cols-2 gap-2xs rounded-selection-bar bg-selection-bar p-selection-bar-inset text-on-selection-bar shadow-selection-bar ios:max-medium:inset-be-none"
      >
        {#each MARKS as { mark: read, icon: Icon, label } (read)}
          <Button
            type="button"
            look="toolbar-action"
            class="gap-xs text-caption min-block-selection-action"
            onclick={() => {
              void mark(read);
            }}
          >
            <Icon size={ACTION_ICON_SIZE} aria-hidden="true" />
            {label()}
          </Button>
        {/each}
      </div>
    {/if}
  {/if}
  <p
    role="status"
    class={outcome.kind === "failed" ? "text-body text-danger" : "sr-only"}
  >
    {announced(outcome)}
  </p>
</section>
