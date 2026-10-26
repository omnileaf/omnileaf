<script lang="ts">
  import { ArrowDownUp, Bookmark, Check, FileX, Search } from "@lucide/svelte";
  import { tick } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import {
    Item,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
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
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { booksMatching } from "#lib/series/book-search.ts";
  import BookProgress from "#lib/series/BookProgress.svelte";
  import { bookSummary } from "#lib/series/book-reading.ts";
  import { isShownBy } from "#lib/series/books-shown.ts";

  import { JUMP_LIST_LOOK, jumpListPhoneLook } from "./jump-list-look.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";

  const SEARCHABLE_FROM = 20;
  const SPINNER_SIZE = 20;
  const ICON_SIZE = 16;
  const DETAIL_ICON_SIZE = 12;
  const SHOWN_OPTIONS: readonly BooksShown[] = ["all", "unread", "bookmarked"];
  const SHOWN_LABELS = {
    all: m.series_show_all,
    unread: m.series_show_unread,
    bookmarked: m.series_show_bookmarked,
  } satisfies Record<BooksShown, () => string>;

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

  const chrome = getReaderChrome();
  const showLabelId = $props.id();
  const phoneLook = $derived(jumpListPhoneLook(chrome.platform, chrome.width));
  const look = $derived(phoneLook ?? JUMP_LIST_LOOK);

  let shown = $state<BooksShown>("all");
  let isCrowded = $state(false);
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
  const sortLabel = $derived(m.series_sort({ order }));

  function isShown(value: string): value is BooksShown {
    return SHOWN_OPTIONS.some((option) => option === value);
  }

  function toggleDirection(): void {
    direction = direction === "ascending" ? "descending" : "ascending";
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

<div class={look.root}>
  {#if isSearchable}
    <InputGroup class={look.find}>
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
  <div class={cn(look.tools, isCrowded && "flex-wrap")}>
    {#if phoneLook !== undefined}
      {#if isCrowded && phoneLook.crowdedShow === "menu"}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                type="button"
                variant={phoneLook.crowdedButton}
              >
                {m.series_show_choice({ shown: SHOWN_LABELS[shown]() })}
                <Icon name="chevrons-up-down" class="shrink-0" />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent to="main" align="start">
            <DropdownMenuRadioGroup
              value={shown}
              onValueChange={(chosen: string) => {
                if (isShown(chosen)) {
                  shown = chosen;
                }
              }}
            >
              {#each SHOWN_OPTIONS as option (option)}
                <DropdownMenuRadioItem value={option}>
                  {SHOWN_LABELS[option]()}
                </DropdownMenuRadioItem>
              {/each}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      {:else}
        <span id={showLabelId} class="sr-only">{m.series_show()}</span>
        <SegmentedControl
          options={SHOWN_OPTIONS}
          labels={SHOWN_LABELS}
          chosen={shown}
          labelledBy={showLabelId}
          isFullWidth
          onChoose={(chosen: BooksShown) => {
            shown = chosen;
          }}
          onFit={(isOneRow: boolean) => {
            isCrowded ||= !isOneRow;
          }}
          class={cn("flex-1 min-inline-none", isCrowded && "basis-full")}
        />
      {/if}
      {#if isCrowded}
        <Button
          type="button"
          variant={phoneLook.crowdedButton}
          aria-label={sortLabel}
          onclick={toggleDirection}
        >
          <Icon name="arrow-down-up" class="shrink-0" />
          {order}
        </Button>
      {:else}
        <Button
          type="button"
          variant={phoneLook.sort}
          iconOnly
          label={sortLabel}
          onclick={toggleDirection}
        >
          <Icon name="arrow-down-up" />
        </Button>
      {/if}
    {:else}
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
        {#each SHOWN_OPTIONS as option (option)}
          <ToggleGroupItem
            value={option}
            data-label={SHOWN_LABELS[option]()}
            class="grow"
          >
            {SHOWN_LABELS[option]()}
          </ToggleGroupItem>
        {/each}
      </ToggleGroup>
      <Tooltip
        label={sortLabel}
        type="button"
        aria-label={sortLabel}
        onclick={toggleDirection}
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
    {/if}
  </div>
  {#if books === undefined}
    <div class="flex justify-center py-xl text-muted">
      <Spinner size={SPINNER_SIZE} label={m.reader_jump_loading()} />
    </div>
  {/if}
  <ul bind:this={list} class={look.list}>
    {#each listed as listedBook (listedBook.id)}
      {@const book = asRead(listedBook)}
      {@const isCurrent = book.id === current}
      <li>
        {#if book.isFileMissing}
          <Item
            look={look.row}
            class={cn(look.rowLayout, "pointer-events-none text-muted")}
          >
            <ItemTitle class={cn(look.title, look.missingTitle)}
              >{book.title}</ItemTitle
            >
            <ItemDescription class={look.detail}>
              <FileX size={DETAIL_ICON_SIZE} aria-hidden="true" />
              {m.reader_jump_file_missing()}
            </ItemDescription>
          </Item>
        {:else}
          <Item
            look={look.row}
            class={cn(look.rowLayout, isCurrent && look.current)}
          >
            {#snippet child({ props })}
              <a
                {...props}
                href={resolve("/read/[book]", { book: book.id })}
                aria-current={isCurrent ? "true" : undefined}
                onclick={(event) => {
                  event.preventDefault();
                  void goto(resolve("/read/[book]", { book: book.id }), {
                    replaceState: true,
                    state: { readerJumped: true },
                  });
                }}
              >
                <span class="flex items-center gap-sm min-inline-none">
                  <ItemTitle
                    class={cn(
                      look.title,
                      book.reading.state === "read" && "text-muted",
                      isCurrent && look.currentTitle,
                    )}>{book.title}</ItemTitle
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
                <ItemDescription
                  class={cn(look.detail, isCurrent && look.currentDetail)}
                >
                  {#if book.reading.state === "read"}
                    <Check size={DETAIL_ICON_SIZE} aria-hidden="true" />
                  {/if}
                  {bookSummary(book)}
                </ItemDescription>
                <BookProgress {book} />
              </a>
            {/snippet}
          </Item>
        {/if}
      </li>
    {/each}
  </ul>
</div>
