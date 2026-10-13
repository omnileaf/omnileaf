<script lang="ts">
  import { Eye, EyeOff, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { beforeNavigate } from "$app/navigation";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    Platform,
    ReadMark,
    SeriesBook,
    SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { shortcut } from "#lib/shortcut.ts";

  import BookList from "./BookList.svelte";
  import BookListingChoices from "./BookListingChoices.svelte";
  import { booksMatching } from "./book-search";
  import BookTable from "./BookTable.svelte";
  import { BookSelection } from "./book-selection.svelte";
  import SelectionBar from "./SelectionBar.svelte";

  type BookId = SeriesBook["id"];

  const ICON_SIZE = 18;
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
  const notices = getNotices();
  const headingId = $props.id();
  const dates = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }),
  );
  let search = $state("");
  const shownBooks = $derived(booksMatching(books, search, getLocale()));
  const ids = $derived(shownBooks.map((book) => book.id));

  let outcome: Outcome = $state({ kind: "none" });
  let section: HTMLElement | undefined = $state();
  let heading: HTMLElement | null = $state(null);
  let selectAllBox: HTMLElement | null = $state(null);

  const isPicking = $derived(selection.isSelecting || selection.count > 0);

  async function startPickingFrom(book: SeriesBook): Promise<void> {
    outcome = { kind: "none" };
    selection.begin(book.id);
    await tick();
    heading?.focus();
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
      (isWide.current ? selectAllBox : heading)?.focus();
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

  async function markSwiped(
    book: SeriesBook,
    read: ReadMark,
    how: "swiped" | "tapped",
  ): Promise<void> {
    const isMarked = await markBooks([book.id], read);
    if (isMarked && how === "swiped") {
      notices.offerUndo({
        title:
          read === "read"
            ? m.series_marked_book_read({ title: book.title })
            : m.series_marked_book_unread({ title: book.title }),
        undo: () => {
          void markBooks([book.id], read === "read" ? "unread" : "read");
        },
      });
    }
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

<svelte:window
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
  data-picking={selection.isSelecting || undefined}
  aria-labelledby={headingId}
  class="flex flex-col gap-sm"
>
  <div
    class={[
      "flex items-center gap-sm min-block-series-back",
      selection.isSelecting &&
        "sticky -inset-bs-page-top z-series-bar -mx-page-start bg-background px-page-start pbs-series-bar-top pbe-xs",
    ]}
  >
    {#if selection.isSelecting}
      <Tooltip
        label={m.series_clear_selection()}
        type="button"
        aria-label={m.series_clear_selection()}
        onclick={() => {
          void end();
        }}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            look="icon"
            class="shrink-0 border border-border bg-card block-series-back inline-series-back"
          >
            <X size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    {/if}
    <h2
      bind:this={heading}
      id={headingId}
      tabindex="-1"
      class="flex-1 text-series-heading font-bold"
    >
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
        type="button"
        look="outline"
        aria-busy={isPickingAll}
        class="rounded-full px-md py-2xs text-detail min-block-series-back"
        onclick={() => {
          void pickAll();
        }}
      >
        {m.series_select_all()}
      </Button>
    {/if}
  </div>
  <BookListingChoices
    {listing}
    onChoose={onListing}
    {search}
    onSearch={(typed: string) => {
      search = typed;
      if (!isComplete) {
        void onLoadAll();
      }
    }}
  />
  {#if isComplete && shownBooks.length === 0}
    <p class="text-body text-muted">
      {search.trim() === ""
        ? m.series_no_unread()
        : m.series_no_match({ search: search.trim() })}
    </p>
  {/if}
  {#if isWide.current}
    <BookTable
      bind:selectAllBox
      books={shownBooks}
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
    <BookList
      books={shownBooks}
      {dates}
      {isComplete}
      {onNearEnd}
      {selection}
      onStartPicking={(book: SeriesBook) => {
        void startPickingFrom(book);
      }}
      onMark={(picked: BookId[], read: ReadMark) => {
        void markBooks(picked, read);
      }}
      onSwiped={(
        book: SeriesBook,
        read: ReadMark,
        how: "swiped" | "tapped",
      ) => {
        void markSwiped(book, read, how);
      }}
    />
    {#if selection.isSelecting && selection.count > 0}
      <Card
        role="group"
        aria-label={m.series_selection_toolbar()}
        class="sticky inset-be-lg grid grid-cols-2 gap-2xs p-xs shadow-popover ios:max-medium:inset-be-none"
      >
        {#each MARKS as { mark: read, icon: Icon, label } (read)}
          <Button
            type="button"
            look="bar-icon"
            class="flex-col text-caption font-semibold min-block-selection-action"
            onclick={() => {
              void mark(read);
            }}
          >
            <Icon size={ACTION_ICON_SIZE} aria-hidden="true" />
            {label()}
          </Button>
        {/each}
      </Card>
    {/if}
  {/if}
  <p
    role="status"
    class={outcome.kind === "failed" ? "text-body text-danger" : "sr-only"}
  >
    {announced(outcome)}
  </p>
</section>
