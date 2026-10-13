<script lang="ts">
  import { Eye, EyeOff } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { LongPress } from "#lib/components/long-press.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import { bookActions } from "./book-actions";
  import BookRowText from "./BookRowText.svelte";
  import type { BookSelection } from "./book-selection.svelte";
  import BookSheet from "./BookSheet.svelte";
  import { RowSwipe } from "./row-swipe.svelte";
  import type { SwipeOutcome } from "./swipe";
  import { getSwipeActionsSetting } from "./swipe-actions.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;
  const SWIPE_ICON_SIZE = 20;

  let {
    books,
    dates,
    isComplete,
    onNearEnd,
    selection,
    onStartPicking,
    onMark,
    onSwiped,
  }: {
    books: readonly SeriesBook[];
    dates: Intl.DateTimeFormat;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: BookSelection<BookId>;
    onStartPicking: (book: SeriesBook) => void;
    onMark: (books: BookId[], mark: ReadMark) => void;
    onSwiped: (
      book: SeriesBook,
      mark: ReadMark,
      how: "swiped" | "tapped",
    ) => void;
  } = $props();

  const longPress = new LongPress(LONG_PRESS_MS);
  const ids = $derived(books.map((book) => book.id));
  const swipeActions = getSwipeActionsSetting();
  const swipe = new RowSwipe(
    (side) => swipeActions.actionFor(side) !== "nothing",
  );

  function swiped(book: SeriesBook, outcome: SwipeOutcome): void {
    if (
      outcome.kind === "act" &&
      swipeActions.actionFor(outcome.side) === "markRead"
    ) {
      onSwiped(book, bookActions(book.reading).mark, "swiped");
    }
  }

  function releasePress(): void {
    longPress.released();
  }

  $effect(() => releasePress);

  function pickRunOnShift(event: MouseEvent, book: SeriesBook): void {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(book.id, ids);
    }
  }
</script>

{#snippet row(book: SeriesBook)}
  {@const isPicked = selection.has(book.id)}
  {#if selection.isSelecting}
    <label
      class={[
        "relative flex cursor-pointer items-center gap-md ps-md pe-md min-block-book-row",
        isPicked && "bg-selected-row",
      ]}
    >
      {#if isPicked}
        <span
          aria-hidden="true"
          class="absolute inset-s-none inset-bs-none inset-be-none bg-accent inline-selected-edge"
        ></span>
      {/if}
      <Checkbox
        bind:checked={
          () => isPicked,
          () => {
            selection.toggle(book.id);
          }
        }
        aria-label={m.series_select_book({ title: book.title })}
        class="rounded-series-check border-check-off block-series-check inline-series-check"
        onclick={(event: MouseEvent) => {
          pickRunOnShift(event, book);
        }}
      />
      <BookRowText {book} {dates} />
    </label>
  {:else}
    {@const side = swipe.sideOf(book.id)}
    {@const action =
      side === undefined ? "nothing" : swipeActions.actionFor(side)}
    {@const mark = bookActions(book.reading).mark}
    <div class="relative overflow-hidden">
      {#if side !== undefined && action === "markRead"}
        <div
          class={[
            "absolute inset-none flex items-center bg-accent px-sm text-on-accent",
            side === "towardEnd" ? "justify-start" : "justify-end",
          ]}
        >
          <Button
            type="button"
            look="icon"
            tabindex={swipe.isRevealed(book.id) ? 0 : -1}
            aria-hidden={!swipe.isRevealed(book.id)}
            class="flex-col gap-2xs px-md text-caption font-bold min-block-touch-target"
            onclick={() => {
              swipe.close();
              onSwiped(book, mark, "tapped");
            }}
          >
            {#if mark === "read"}
              <Eye size={SWIPE_ICON_SIZE} aria-hidden="true" />
              {m.series_mark_read()}
            {:else}
              <EyeOff size={SWIPE_ICON_SIZE} aria-hidden="true" />
              {m.series_mark_unread()}
            {/if}
          </Button>
        </div>
      {/if}
      <div
        role="presentation"
        data-swiped
        class={[
          "relative flex touch-pan-y items-center gap-xs bg-card ps-md pe-2xs select-none min-block-book-row",
          !swipe.isDragging &&
            "motion-safe:transition-transform motion-safe:duration-slide",
        ]}
        style:translate="{swipe.offsetOf(book.id)}px 0"
        onpointerdown={(event) => {
          if (event.currentTarget instanceof HTMLElement) {
            swipe.pressed(event, book.id, event.currentTarget);
          }
          longPress.pressed(event, () => {
            onStartPicking(book);
          });
        }}
        onpointermove={(event) => {
          if (swipe.moved(event)) {
            releasePress();
          }
        }}
        onpointerup={() => {
          releasePress();
          swiped(book, swipe.released());
        }}
        onpointercancel={() => {
          releasePress();
          swipe.cancelled();
        }}
        onpointerleave={releasePress}
        onclickcapture={(event) => {
          swipe.clicked(event, book.id);
        }}
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
        <BookSheet
          {book}
          onMark={(chosen: ReadMark) => {
            onMark([book.id], chosen);
          }}
          onSelect={() => {
            onStartPicking(book);
          }}
        />
      </div>
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
/>

<Card class="overflow-hidden">
  <VirtualGrid
    items={books}
    key={(book: SeriesBook) => book.id}
    label={m.series_books_list()}
    {isComplete}
    {onNearEnd}
    class="grid-cols-1"
    itemClass="border-be border-border last:border-be-0"
    cell={row}
  />
</Card>
