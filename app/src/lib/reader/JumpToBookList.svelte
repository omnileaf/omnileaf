<script lang="ts">
  import { ArrowDownUp, Bookmark, Check, FileX, Search } from "@lucide/svelte";
  import { tick } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    BooksShown,
    OpenedBook,
    SeriesBook,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { booksMatching } from "#lib/series/book-search.ts";
  import BookProgress from "#lib/series/BookProgress.svelte";
  import { bookSummary } from "#lib/series/book-reading.ts";
  import { isShownBy } from "#lib/series/books-shown.ts";

  const SEARCHABLE_FROM = 20;
  const SPINNER_SIZE = 20;
  const ICON_SIZE = 16;
  const DETAIL_ICON_SIZE = 12;
  const SHOWN = [
    { shown: "all", label: m.series_show_all },
    { shown: "unread", label: m.series_show_unread },
    { shown: "bookmarked", label: m.series_show_bookmarked },
  ] as const satisfies readonly { shown: BooksShown; label: () => string }[];

  let {
    books,
    current,
    currentPage,
    onClose,
  }: {
    books: readonly SeriesBook[] | undefined;
    current: OpenedBook["id"];
    currentPage: number;
    onClose: () => void;
  } = $props();

  let shown = $state<BooksShown>("all");
  let direction = $state<SortDirection>("ascending");
  let search = $state("");
  let list: HTMLUListElement | undefined = $state();

  const isSearchable = $derived((books?.length ?? 0) >= SEARCHABLE_FROM);
  const listed = $derived.by(() => {
    const kept = booksMatching(
      (books ?? []).filter((book) => isShownBy(shown, book)),
      search,
      getLocale(),
    );
    return direction === "descending" ? kept.toReversed() : kept;
  });
  const order = $derived(
    direction === "descending"
      ? m.series_order_last_first()
      : m.series_order_first_first(),
  );

  function isShown(value: string): value is BooksShown {
    return SHOWN.some((choice) => choice.shown === value);
  }

  function asRead(book: SeriesBook): SeriesBook {
    return book.id === current
      ? { ...book, reading: { state: "started", page: currentPage } }
      : book;
  }

  $effect(() => {
    if (list === undefined) {
      return;
    }
    const shownList = list;
    void tick().then(() => {
      shownList
        .querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "center" });
    });
  });
</script>

<div class="flex flex-col gap-sm">
  {#if isSearchable}
    <InputGroup
      class="gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted min-block-touch-target focus-within:border-accent expanded:min-block-pointer-button"
    >
      <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
      <Input
        type="search"
        aria-label={m.series_find_book()}
        placeholder={m.series_find_book()}
        value={search}
        oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
          search = event.currentTarget.value;
        }}
        class="text-body text-foreground expanded:text-small"
        onkeydown={(event: KeyboardEvent) => {
          if (event.key !== "Escape") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (search === "") {
            onClose();
          } else {
            search = "";
          }
        }}
      />
    </InputGroup>
  {/if}
  <div class="flex items-stretch gap-sm">
    <ToggleGroup
      aria-label={m.series_show()}
      class="flex-1"
      bind:value={
        () => shown,
        (chosen: string) => {
          if (isShown(chosen)) {
            shown = chosen;
          }
        }
      }
    >
      {#each SHOWN as choice (choice.shown)}
        <ToggleGroupItem
          value={choice.shown}
          data-label={choice.label()}
          class="grow"
        >
          {choice.label()}
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
    <Tooltip
      label={m.series_sort({ order })}
      type="button"
      aria-label={m.series_sort({ order })}
      onclick={() => {
        direction = direction === "ascending" ? "descending" : "ascending";
      }}
    >
      {#snippet child({ props })}
        <button
          {...props}
          class="flex shrink-0 items-center justify-center rounded-shadcn-button border border-border bg-card transition-control block-touch-target inline-touch-target hover:bg-hover expanded:block-pointer-button expanded:inline-pointer-button"
        >
          <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
        </button>
      {/snippet}
    </Tooltip>
  </div>
  {#if books === undefined}
    <div class="flex justify-center py-xl text-muted">
      <Spinner size={SPINNER_SIZE} label={m.reader_jump_loading()} />
    </div>
  {/if}
  <ul
    bind:this={list}
    class="flex flex-col overflow-hidden max-expanded:divide-y max-expanded:divide-border max-expanded:rounded-shadcn-control max-expanded:border max-expanded:border-border expanded:gap-2xs"
  >
    {#each listed as listedBook (listedBook.id)}
      {@const book = asRead(listedBook)}
      {@const isCurrent = book.id === current}
      <li>
        {#if book.isFileMissing}
          <div
            class="flex flex-col gap-2xs border-s-2 border-transparent px-md py-sm text-muted"
          >
            <span
              class="truncate text-body font-medium line-through expanded:text-small"
              >{book.title}</span
            >
            <span
              class="flex items-center gap-xs text-small expanded:text-caption"
            >
              <FileX size={DETAIL_ICON_SIZE} aria-hidden="true" />
              {m.reader_jump_file_missing()}
            </span>
          </div>
        {:else}
          <a
            href={resolve("/read/[book]", { book: book.id })}
            aria-current={isCurrent ? "true" : undefined}
            onclick={(event) => {
              event.preventDefault();
              void goto(resolve("/read/[book]", { book: book.id }), {
                replaceState: true,
                state: { readerJumped: true },
              });
            }}
            class={cn(
              "flex flex-col gap-2xs border-s-2 px-md py-sm transition-control hover:bg-hover active:bg-pressed expanded:rounded-shadcn-control",
              isCurrent ? "border-accent bg-hover" : "border-transparent",
            )}
          >
            <span class="flex items-center gap-sm min-inline-none">
              <span
                class={cn(
                  "truncate text-body font-medium expanded:text-small",
                  book.reading.state === "read" && "text-muted",
                )}>{book.title}</span
              >
              {#if book.isBookmarked}
                <Bookmark
                  size={DETAIL_ICON_SIZE}
                  fill="currentColor"
                  role="img"
                  aria-label={m.series_book_bookmarked()}
                  class="shrink-0"
                />
              {/if}
              {#if isCurrent}
                <Badge look="secondary">{m.reader_jump_reading()}</Badge>
              {/if}
            </span>
            <span
              class="flex items-center gap-xs text-small text-muted expanded:text-caption"
            >
              {#if book.reading.state === "read"}
                <Check size={DETAIL_ICON_SIZE} aria-hidden="true" />
              {/if}
              {bookSummary(book)}
            </span>
            <BookProgress {book} />
          </a>
        {/if}
      </li>
    {/each}
  </ul>
</div>
