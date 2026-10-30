<script lang="ts">
  import { BookmarkPlus, Eye, EyeOff, List, X } from "@lucide/svelte";
  import { Portal } from "bits-ui";
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { beforeNavigate } from "$app/navigation";
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ButtonVariant } from "#lib/components/ui/button/looks.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    Platform,
    ReadMark,
    SeriesBook,
    SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { EXPANDED_QUERY, WindowWidth } from "#lib/page/breakpoints.ts";
  import { type PhonePlatform, phoneOf } from "#lib/page/platform.ts";
  import {
    DOCKED_BAR,
    DOCKED_ROW,
    FLOATING_BAR,
  } from "#lib/navigation/tab-bar.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { shortcut } from "#lib/shortcut.ts";

  import BookList from "./BookList.svelte";
  import BookListingChoices from "./BookListingChoices.svelte";
  import { booksMatching } from "./book-search";
  import BookTable from "./BookTable.svelte";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import { SERIES_CONTROL } from "./series-control.ts";
  import BarControls from "./BarControls.svelte";
  import SelectionBar from "./SelectionBar.svelte";

  type BookId = SeriesBook["id"];

  type BarControl = "close" | "done" | "selectAll";

  interface PhonePicking {
    readonly leading: readonly BarControl[];
    readonly trailing: readonly BarControl[];
    readonly endsWhenNonePicked: boolean;
    readonly hasDeselectAll: boolean;
    readonly title: string;
    readonly toolbar: string;
    readonly toolbarRow: string;
    readonly action: string;
    readonly isIconOnly: boolean;
    readonly isDocked: boolean;
    readonly emptyAction: ButtonVariant;
    readonly emptyActionHasIcon: boolean;
  }

  const PHONE_PICKING: Readonly<Record<PhonePlatform, PhonePicking>> = {
    ios: {
      leading: ["selectAll"],
      trailing: ["done"],
      endsWhenNonePicked: false,
      hasDeselectAll: true,
      title: "text-center",
      toolbar: FLOATING_BAR,
      toolbarRow: "flex items-center gap-2xs max-inline-full",
      action: "disabled:text-faint",
      isIconOnly: true,
      isDocked: false,
      emptyAction: "plain",
      emptyActionHasIcon: false,
    },
    android: {
      leading: ["close"],
      trailing: ["selectAll"],
      endsWhenNonePicked: true,
      hasDeselectAll: false,
      title: "",
      toolbar: `fixed inset-x-none inset-be-none z-tab-bar ps-safe-start pbe-safe-bottom ${DOCKED_BAR}`,
      toolbarRow: `flex ${DOCKED_ROW}`,
      action: "flex-1 flex-col gap-2xs min-inline-none disabled:text-faint",
      isIconOnly: false,
      isDocked: true,
      emptyAction: "secondary",
      emptyActionHasIcon: true,
    },
  };

  const ICON_SIZE = 18;
  const ACTION_ICON_SIZE = 20;
  const MARKS = [
    { mark: "read", icon: Eye, glyph: "eye", label: m.series_mark_read },
    {
      mark: "unread",
      icon: EyeOff,
      glyph: "eye-off",
      label: m.series_mark_unread,
    },
  ] as const;

  let {
    books,
    seriesTitle,
    bookCount,
    readCount,
    bookmarkCount,
    listing,
    onListing,
    isComplete,
    onNearEnd,
    onLoadAll,
    onMark,
    onBookmark,
    platform,
    onPickedCount,
  }: {
    books: readonly SeriesBook[];
    seriesTitle: string;
    bookCount: number;
    readCount: number;
    bookmarkCount: number;
    listing: SeriesBookListing;
    onListing: (listing: SeriesBookListing) => void;
    isComplete: boolean;
    onNearEnd: () => void;
    onLoadAll: () => Promise<void>;
    onMark: (books: BookId[], mark: ReadMark) => Promise<boolean>;
    onBookmark: (
      books: BookId[],
    ) => Promise<{ newlyBookmarked: number; failed: boolean }>;
    platform: Platform;
    onPickedCount?: ((count: number | undefined) => void) | undefined;
  } = $props();

  type Outcome =
    | { readonly kind: "none" }
    | {
        readonly kind: "marked";
        readonly mark: ReadMark;
        readonly count: number;
      }
    | { readonly kind: "bookmarked"; readonly count: number }
    | { readonly kind: "failed"; readonly action: "mark" | "bookmark" }
    | { readonly kind: "pickedAll"; readonly count: number };

  const selection = new Selection<BookId>();
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const width = new WindowWidth();
  const phonePlatform = $derived(phoneOf(platform, width.current));
  const phone = $derived(
    phonePlatform === undefined ? undefined : PHONE_PICKING[phonePlatform],
  );
  let toolbarHeight = $state(0);
  const emptyAction = $derived(
    phone === undefined
      ? { look: "outline" as const, class: SERIES_CONTROL }
      : { variant: phone.emptyAction },
  );
  const isPhonePicking = $derived(phone !== undefined && selection.isSelecting);
  const notices = getNotices();
  const headingId = $props.id();
  const dates = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }),
  );
  let search = $state("");
  let isShownCrowded = $state(false);
  const shownBooks = $derived(booksMatching(books, search, getLocale()));
  const ids = $derived(shownBooks.map((book) => book.id));

  let outcome: Outcome = $state({ kind: "none" });
  let section: HTMLElement | undefined = $state();
  let toolbar: HTMLElement | undefined = $state();
  let heading: HTMLElement | null = $state(null);
  let selectAllBox: HTMLElement | null = $state(null);

  const isPicking = $derived(selection.isSelecting || selection.count > 0);

  $effect(() => {
    onPickedCount?.(selection.count > 0 ? selection.count : undefined);
    return () => {
      onPickedCount?.(undefined);
    };
  });
  const isAllPicked = $derived(
    phone?.hasDeselectAll === true && isComplete && selection.hasAll(ids),
  );

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
      [section, toolbar].some((part) => part?.contains(focused) === true)
    );
  }

  let endings = 0;

  async function end(): Promise<void> {
    const isFocusToKeep = isFocusHereOrLost();
    endings += 1;
    selection.end();
    if (isFocusToKeep) {
      await tick();
      (isWide.current ? selectAllBox : heading)?.focus();
    }
  }

  let isPickingAll = $state(false);

  async function pickAll(): Promise<void> {
    const endsBefore = endings;
    isPickingAll = true;
    try {
      await onLoadAll();
    } finally {
      isPickingAll = false;
    }
    if (endings !== endsBefore) {
      return;
    }
    selection.pickAll(ids);
    if (!isPhonePicking) {
      outcome = { kind: "pickedAll", count: selection.count };
    }
  }

  async function markBooks(picked: BookId[], read: ReadMark): Promise<boolean> {
    const isMarked = await onMark(picked, read);
    outcome = isMarked
      ? { kind: "marked", mark: read, count: picked.length }
      : { kind: "failed", action: "mark" };
    return isMarked;
  }

  async function bookmarkSelected(picked: BookId[]): Promise<boolean> {
    const { newlyBookmarked, failed } = await onBookmark(picked);
    if (failed) {
      outcome = { kind: "failed", action: "bookmark" };
      return false;
    }
    if (newlyBookmarked > 0) {
      outcome = { kind: "bookmarked", count: newlyBookmarked };
    }
    return true;
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

  async function bookmark(): Promise<void> {
    if (await bookmarkSelected(selection.picked)) {
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

  $effect(() => {
    if (!isPicking) {
      return;
    }
    return takeBackWithinScreen(() => {
      void end();
    });
  });

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
      case "bookmarked":
        return m.series_bookmarked_books({ count: shown.count });
      case "failed":
        return shown.action === "mark"
          ? m.series_mark_failed()
          : m.series_bookmark_failed();
      case "pickedAll":
        return m.series_selected_count({ count: shown.count });
    }
  }

  function endPicking(): void {
    void end();
  }

  function pickAllShown(): void {
    void pickAll();
  }

  function pickNone(): void {
    selection.pickOnly([]);
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
    data-picking-bar={isPhonePicking || undefined}
    class={[
      "flex items-center gap-sm min-block-series-back",
      selection.isSelecting &&
        "sticky -inset-bs-page-top z-series-bar -mx-page-start px-page-start pbs-series-bar-top pbe-xs",
      isPhonePicking
        ? "flex-wrap bg-native-grouped-ground"
        : selection.isSelecting && "bg-background",
    ]}
  >
    {#if isPhonePicking}
      <BarControls
        controls={phone?.leading ?? []}
        {isPickingAll}
        {isAllPicked}
        onEnd={endPicking}
        onPickAll={pickAllShown}
        onPickNone={pickNone}
      />
    {:else if selection.isSelecting}
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
      aria-live={isPhonePicking ? "polite" : undefined}
      class={[
        "text-group-title font-semibold",
        selection.isSelecting && "flex-1",
        isPhonePicking && ["wrap-break-word max-inline-full", phone?.title],
        isWide.current && "sr-only",
      ]}
    >
      {selection.isSelecting
        ? m.series_selected_count({ count: selection.count })
        : m.series_books_heading({ count: bookCount })}
    </h2>
    {#if isPhonePicking}
      <BarControls
        controls={phone?.trailing ?? []}
        {isPickingAll}
        {isAllPicked}
        onEnd={endPicking}
        onPickAll={pickAllShown}
        onPickNone={pickNone}
      />
    {:else if !selection.isSelecting && !isWide.current}
      <p class="flex-1 text-small text-muted">
        {bookmarkCount > 0
          ? m.series_read_and_bookmarked({
              read: readCount,
              bookmarked: bookmarkCount,
            })
          : m.series_read_only({ read: readCount })}
      </p>
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
    phone={phonePlatform}
    {listing}
    onChoose={onListing}
    {search}
    onSearch={(typed: string) => {
      search = typed;
      if (!isComplete) {
        void onLoadAll();
      }
    }}
    onShownCrowded={(isCrowded: boolean) => {
      isShownCrowded = isCrowded;
    }}
  />
  {#if isComplete && shownBooks.length === 0}
    <Card
      class={[
        "flex flex-col items-center gap-md px-lg py-xl text-center expanded:p-2xl",
        phone === undefined && "shadow-card-rest",
      ]}
    >
      {#if search.trim() !== ""}
        <p class="text-body">{m.series_no_match({ search: search.trim() })}</p>
        <Button
          type="button"
          {...emptyAction}
          onclick={() => {
            search = "";
          }}
        >
          {#if phone?.emptyActionHasIcon !== false}
            <X size={ICON_SIZE} aria-hidden="true" />
          {/if}
          {m.series_clear_search()}
        </Button>
      {:else}
        <p class="text-body">
          {listing.shown === "bookmarked"
            ? m.series_no_bookmarked()
            : m.series_no_unread()}
        </p>
        <Button
          type="button"
          {...emptyAction}
          onclick={() => {
            onListing({ ...listing, shown: "all" });
          }}
        >
          {#if phone?.emptyActionHasIcon !== false}
            <List size={ICON_SIZE} aria-hidden="true" />
          {/if}
          {m.series_show_all_books()}
        </Button>
      {/if}
    </Card>
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
      onBookmark={platform === "macos"
        ? (picked: BookId[]) => {
            void bookmarkSelected(picked);
          }
        : undefined}
    />
    {#if selection.count > 0 && platform === "macos"}
      <Portal to="[data-title-bar-actions]">
        <div
          bind:this={toolbar}
          role="group"
          aria-label={m.series_selection_toolbar()}
          class="flex items-center gap-sm"
        >
          {#each MARKS as { mark: read, glyph, label } (read)}
            <Button
              type="button"
              variant="plain"
              iconOnly
              label={label()}
              onclick={() => {
                void mark(read);
              }}
            >
              <Icon name={glyph} />
            </Button>
          {/each}
          <Button
            type="button"
            variant="plain"
            iconOnly
            label={m.series_bookmark()}
            onclick={() => {
              void bookmark();
            }}
          >
            <Icon name="bookmark" />
          </Button>
        </div>
      </Portal>
    {:else if selection.count > 0}
      <SelectionBar
        count={selection.count}
        onMark={(read: ReadMark) => {
          void mark(read);
        }}
        onBookmark={() => {
          void bookmark();
        }}
        onClear={() => {
          void end();
        }}
      />
    {/if}
  {:else}
    <BookList
      phone={phonePlatform}
      books={shownBooks}
      {seriesTitle}
      hasTwoLineTitles={isShownCrowded}
      {isComplete}
      {onNearEnd}
      {selection}
      onStartPicking={(book: SeriesBook) => {
        void startPickingFrom(book);
      }}
      onPickedNone={() => {
        if (phone?.endsWhenNonePicked === true) {
          void end();
        }
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
    {#if isPhonePicking && phone !== undefined}
      <Portal>
        <div
          bind:this={toolbar}
          role="group"
          aria-label={m.series_selection_toolbar()}
          bind:offsetHeight={toolbarHeight}
          class={phone.toolbar}
        >
          <div class={phone.toolbarRow}>
            {#each MARKS as { mark: read, glyph, label } (read)}
              <Button
                type="button"
                variant="plain"
                {...phone.isIconOnly ? { iconOnly: true, label: label() } : {}}
                disabled={selection.count === 0}
                class={phone.action}
                onclick={() => {
                  void mark(read);
                }}
              >
                <Icon name={glyph} />
                {#if !phone.isIconOnly}
                  {label()}
                {/if}
              </Button>
            {/each}
          </div>
        </div>
      </Portal>
      {#if phone.isDocked}
        <Portal to="main">
          <div
            aria-hidden="true"
            class="shrink-0"
            style:block-size="{toolbarHeight}px"
          ></div>
        </Portal>
      {/if}
    {:else if selection.isSelecting && selection.count > 0}
      <Card
        role="group"
        aria-label={m.series_selection_toolbar()}
        class="sticky inset-be-lg grid grid-cols-3 gap-2xs p-xs shadow-popover"
      >
        {#each MARKS as { mark: read, icon: MarkIcon, label } (read)}
          <Button
            type="button"
            look="bar-icon"
            class="flex-col text-caption font-semibold wrap-anywhere min-block-selection-action"
            onclick={() => {
              void mark(read);
            }}
          >
            <MarkIcon size={ACTION_ICON_SIZE} aria-hidden="true" />
            {label()}
          </Button>
        {/each}
        <Button
          type="button"
          look="bar-icon"
          class="flex-col text-caption font-semibold wrap-anywhere min-block-selection-action"
          onclick={() => {
            void bookmark();
          }}
        >
          <BookmarkPlus size={ACTION_ICON_SIZE} aria-hidden="true" />
          {m.series_bookmark()}
        </Button>
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
