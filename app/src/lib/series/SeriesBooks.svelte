<script lang="ts">
  import { Check, Eye, EyeOff, ListChecks } from "@lucide/svelte";
  import { tick } from "svelte";

  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import BookRowText from "./BookRowText.svelte";
  import { BookSelection } from "./book-selection.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;
  const ICON_SIZE = 16;
  const ACTION_ICON_SIZE = 20;
  const CHECK_ICON_SIZE = 14;

  let {
    books,
    bookCount,
    isComplete,
    onNearEnd,
    onLoadAll,
    onMark,
  }: {
    books: readonly SeriesBook[];
    bookCount: number;
    isComplete: boolean;
    onNearEnd: () => void;
    onLoadAll: () => Promise<void>;
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
  } = $props();

  type Outcome =
    | { readonly kind: "none" }
    | {
        readonly kind: "marked";
        readonly mark: ReadMark;
        readonly count: number;
      }
    | { readonly kind: "failed" };

  const selection = new BookSelection<BookId>();
  const headingId = $props.id();
  const dates = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }),
  );
  const ids = $derived(books.map((book) => book.id));

  let outcome: Outcome = $state({ kind: "none" });
  let section: HTMLElement | undefined = $state();
  let selectButton: HTMLButtonElement | undefined = $state();
  let selectAllButton: HTMLButtonElement | undefined = $state();
  let pressing: ReturnType<typeof setTimeout> | undefined;
  let isClickAfterPressSwallowed = false;

  function pick(event: MouseEvent, book: SeriesBook): void {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(book.id, ids);
      return;
    }
    selection.toggle(book.id);
  }

  function pressStarted(event: PointerEvent, book: SeriesBook): void {
    if (event.pointerType === "mouse") {
      return;
    }
    pressEnded();
    pressing = setTimeout(() => {
      pressing = undefined;
      isClickAfterPressSwallowed = true;
      outcome = { kind: "none" };
      selection.begin(book.id);
    }, LONG_PRESS_MS);
  }

  function pressEnded(): void {
    clearTimeout(pressing);
    pressing = undefined;
  }

  function forgetPressBeforeNextTouch(): void {
    isClickAfterPressSwallowed = false;
  }

  function swallowClickAfterPress(event: MouseEvent): void {
    if (isClickAfterPressSwallowed) {
      isClickAfterPressSwallowed = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  $effect(() => pressEnded);

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
      selectButton?.focus();
    }
  }

  async function pickAll(): Promise<void> {
    await onLoadAll();
    selection.pickAll(ids);
  }

  async function mark(read: ReadMark): Promise<void> {
    const picked = selection.pickedIn(ids);
    const isMarked = await onMark(picked, read);
    if (isMarked) {
      outcome = { kind: "marked", mark: read, count: picked.length };
      await end();
    } else {
      outcome = { kind: "failed" };
    }
  }

  function endOnEscape(event: KeyboardEvent): void {
    if (
      event.key === "Escape" &&
      !event.defaultPrevented &&
      selection.isSelecting
    ) {
      void end();
    }
  }

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
      <span class="relative flex shrink-0">
        <input
          type="checkbox"
          checked={isPicked}
          aria-label={m.series_select_book({ title: book.title })}
          class="peer appearance-none rounded-series-check border-2 border-check-off block-series-check inline-series-check checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent expanded:rounded-series-check-wide expanded:block-series-check-wide expanded:inline-series-check-wide"
          onclick={(event) => {
            pick(event, book);
          }}
        />
        <Check
          size={CHECK_ICON_SIZE}
          strokeWidth={3}
          aria-hidden="true"
          class="pointer-events-none absolute inset-none m-auto hidden text-on-accent peer-checked:block"
        />
      </span>
      <BookRowText {book} {dates} />
    </label>
  {:else}
    <div
      role="presentation"
      class="flex items-center gap-md select-none min-block-book-row max-medium:ps-page-start max-medium:pe-md medium:px-lg expanded:px-md expanded:min-block-book-row-wide"
      onpointerdown={(event) => {
        pressStarted(event, book);
      }}
      onpointerup={pressEnded}
      onpointercancel={pressEnded}
      onpointerleave={pressEnded}
      oncontextmenu={(event) => {
        event.preventDefault();
      }}
    >
      <BookRowText {book} {dates} />
    </div>
  {/if}
{/snippet}

<svelte:window
  onpointerdowncapture={forgetPressBeforeNextTouch}
  onclickcapture={swallowClickAfterPress}
  onkeydown={endOnEscape}
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
    {#if selection.isSelecting}
      <span class="text-detail text-muted max-large:hidden">
        {m.series_select_range_hint()}
      </span>
      <button
        bind:this={selectAllButton}
        type="button"
        class="rounded-control border border-border bg-card px-md text-detail font-semibold block-series-back expanded:block-series-crumb"
        onclick={() => {
          void pickAll();
        }}
      >
        {m.series_select_all()}
      </button>
      <button
        type="button"
        class="rounded-control bg-accent px-md text-detail font-bold text-on-accent block-series-back expanded:block-series-crumb"
        onclick={() => {
          void end();
        }}
      >
        {m.series_select_done()}
      </button>
    {:else}
      <button
        bind:this={selectButton}
        type="button"
        class="flex items-center gap-icon-gap rounded-control border border-border bg-card px-md text-detail font-semibold block-series-back expanded:block-series-crumb"
        onclick={() => {
          void begin();
        }}
      >
        <ListChecks size={ICON_SIZE} aria-hidden="true" />
        {m.series_select()}
      </button>
    {/if}
  </div>
  <div
    class="max-medium:-ms-page-start max-medium:-me-page-end medium:overflow-hidden medium:rounded-card medium:border medium:border-border medium:bg-card"
  >
    <div
      aria-hidden="true"
      class="flex items-center gap-md border-be border-border px-md text-caption font-semibold text-muted block-series-columns max-expanded:hidden"
    >
      {#if selection.isSelecting}
        <span class="shrink-0 inline-series-check-wide"></span>
      {/if}
      <span class="flex-1">{m.series_column_book()}</span>
      <span class="inline-series-column-added">{m.series_column_added()}</span>
      <span class="inline-series-column-progress">
        {m.series_column_progress()}
      </span>
    </div>
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
      class="sticky inset-be-lg grid grid-cols-2 gap-2xs rounded-selection-bar bg-selection-bar p-selection-bar-inset text-on-selection-bar shadow-selection-bar expanded:flex expanded:items-center expanded:gap-xs expanded:self-center expanded:rounded-selection-bar-wide expanded:ps-lg ios:max-medium:inset-be-floating-clearance"
    >
      <span class="text-detail font-bold max-expanded:hidden expanded:me-sm">
        {m.series_selected_books({ count: selection.count })}
      </span>
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-xs rounded-selection-action text-caption font-semibold min-block-selection-action expanded:flex-row expanded:gap-icon-gap expanded:rounded-selection-action-wide expanded:bg-selection-action expanded:px-md expanded:text-detail expanded:min-block-selection-action-wide"
        onclick={() => {
          void mark("read");
        }}
      >
        <Eye size={ACTION_ICON_SIZE} aria-hidden="true" />
        {m.series_mark_read()}
      </button>
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-xs rounded-selection-action text-caption font-semibold min-block-selection-action expanded:flex-row expanded:gap-icon-gap expanded:rounded-selection-action-wide expanded:bg-selection-action expanded:px-md expanded:text-detail expanded:min-block-selection-action-wide"
        onclick={() => {
          void mark("unread");
        }}
      >
        <EyeOff size={ACTION_ICON_SIZE} aria-hidden="true" />
        {m.series_mark_unread()}
      </button>
    </div>
  {/if}
  <p
    role="status"
    class={outcome.kind === "failed" ? "text-body text-danger" : "sr-only"}
  >
    {announced(outcome)}
  </p>
</section>
