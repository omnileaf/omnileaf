<script lang="ts">
  import { Eye, EyeOff } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { LongPress } from "#lib/components/long-press.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import { Item } from "#lib/components/ui/item/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import type { PhonePlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import { bookActions } from "./book-actions";
  import BookMenu from "./BookMenu.svelte";
  import BookRowText from "./BookRowText.svelte";
  import PhoneBookRowText from "./PhoneBookRowText.svelte";
  import type { Selection } from "#lib/page/selection.svelte.ts";
  import BookSheet from "./BookSheet.svelte";
  import { REVEALED_PX, RowSwipe } from "./row-swipe.svelte";
  import type { SwipeOutcome } from "./swipe";
  import { getSwipeActionsSetting } from "./swipe-actions.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;
  const SWIPE_ICON_SIZE = 20;
  const CAPSULE_GAP_PX = 8;
  const CAPSULE_WIDEST_REVEAL_PX = 156;
  const CAPSULE_ACT_PAST_OPEN_PX = 48;

  interface PhoneList {
    readonly plate: string;
    readonly surface: string;
    readonly progress: "beside" | "below";
    readonly more: "menu" | "sheet";
    readonly longPress: "menu" | "pick";
    readonly isSwipeCapsule: boolean;
  }

  const PHONE_LISTS: Readonly<Record<PhonePlatform, PhoneList>> = {
    ios: {
      plate: "overflow-hidden rounded-native-group bg-native-group",
      surface: "bg-native-group",
      progress: "beside",
      more: "menu",
      longPress: "menu",
      isSwipeCapsule: true,
    },
    android: {
      plate: "-ms-page-start -me-page-end",
      surface: "bg-native-grouped-ground",
      progress: "below",
      more: "sheet",
      longPress: "pick",
      isSwipeCapsule: false,
    },
  };

  let {
    phone: phonePlatform,
    books,
    seriesTitle,
    hasTwoLineTitles,
    isComplete,
    onNearEnd,
    selection,
    onStartPicking,
    onPickedNone,
    onMark,
    onSwiped,
  }: {
    phone: PhonePlatform | undefined;
    books: readonly SeriesBook[];
    seriesTitle: string;
    hasTwoLineTitles: boolean;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: Selection<BookId>;
    onStartPicking: (book: SeriesBook) => void;
    onPickedNone: () => void;
    onMark: (books: BookId[], mark: ReadMark) => void;
    onSwiped: (
      book: SeriesBook,
      mark: ReadMark,
      how: "swiped" | "tapped",
    ) => void;
  } = $props();

  const phone = $derived(
    phonePlatform === undefined ? undefined : PHONE_LISTS[phonePlatform],
  );
  const longPress = new LongPress(LONG_PRESS_MS);
  let menuFor: BookId | undefined = $state();
  let isContextMenu = $state(false);
  const grid = $derived({
    items: books,
    key: (book: SeriesBook) => book.id,
    label: m.series_books_list(),
    isComplete,
    onNearEnd,
    cell: row,
  });
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

  function held(book: SeriesBook): void {
    swipe.cancelled();
    swipe.close();
    if (phone?.longPress === "menu") {
      menuFor = book.id;
      isContextMenu = true;
    } else {
      onStartPicking(book);
    }
  }

  function capsuleRevealPx(row: HTMLElement): number {
    const word = row.parentElement?.querySelector("[data-swipe-action] > *");
    const action = word?.parentElement;
    if (!(word instanceof HTMLElement) || action == null) {
      return REVEALED_PX;
    }
    const style = getComputedStyle(action);
    const measured =
      word.offsetWidth +
      Number.parseFloat(style.paddingInlineStart) +
      Number.parseFloat(style.paddingInlineEnd) +
      CAPSULE_GAP_PX;
    return Math.min(Math.max(measured, REVEALED_PX), CAPSULE_WIDEST_REVEAL_PX);
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
  {#if selection.isSelecting && phone !== undefined}
    <Item look="row" data-picked={isPicked || undefined} class="cursor-pointer">
      {#snippet child({ props })}
        <label {...props}>
          <Checkbox
            bind:checked={
              () => isPicked,
              () => {
                selection.toggle(book.id);
                if (selection.count === 0) {
                  onPickedNone();
                }
              }
            }
            aria-label={m.series_select_book({ title: book.title })}
            class="rounded-native-select block-native-select inline-native-select aria-checked:border-native-button-primary aria-checked:bg-native-button-primary aria-checked:text-native-on-button-primary"
          />
          <PhoneBookRowText
            {book}
            progress={phone.progress}
            hasTwoLineTitle={hasTwoLineTitles}
          />
        </label>
      {/snippet}
    </Item>
  {:else if selection.isSelecting}
    <label
      data-picked={isPicked || undefined}
      class={[
        "relative flex cursor-pointer items-center gap-md py-sm ps-md pe-md min-block-book-row",
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
      <BookRowText {book} />
    </label>
  {:else}
    {@const side = swipe.sideOf(book.id)}
    {@const action =
      side === undefined ? "nothing" : swipeActions.actionFor(side)}
    {@const mark = bookActions(book.reading).mark}
    {@const isCapsule = phone?.isSwipeCapsule === true && action === "markRead"}
    <div class="relative overflow-hidden">
      {#if side !== undefined && action === "markRead"}
        <div
          class={[
            "absolute inset-none flex items-center",
            isCapsule
              ? "bg-native-grouped-ground p-2xs"
              : "bg-accent px-sm text-on-accent",
            side === "towardEnd" ? "justify-start" : "justify-end",
          ]}
        >
          <Button
            type="button"
            look="icon"
            tabindex={swipe.isRevealed(book.id) ? 0 : -1}
            aria-hidden={!swipe.isRevealed(book.id)}
            data-swipe-action
            style={isCapsule
              ? `inline-size: ${String(Math.max(Math.abs(swipe.offsetOf(book.id)) - CAPSULE_GAP_PX, 0))}px`
              : undefined}
            class={isCapsule
              ? "gap-xs self-stretch overflow-hidden rounded-full bg-native-button-primary px-md text-caption font-bold whitespace-nowrap text-native-on-button-primary"
              : "flex-col gap-2xs px-md text-caption font-bold min-block-touch-target"}
            onclick={() => {
              swipe.close();
              onSwiped(book, mark, "tapped");
            }}
          >
            <span
              class={[
                "flex items-center",
                isCapsule ? "gap-xs" : "flex-col gap-2xs",
                isCapsule && swipe.isRevealed(book.id)
                  ? "text-center whitespace-normal min-inline-none"
                  : "shrink-0",
              ]}
            >
              {#if mark === "read"}
                <Eye size={SWIPE_ICON_SIZE} aria-hidden="true" />
                {m.series_mark_read()}
              {:else}
                <EyeOff size={SWIPE_ICON_SIZE} aria-hidden="true" />
                {m.series_mark_unread()}
              {/if}
            </span>
          </Button>
        </div>
      {/if}
      <div
        role="presentation"
        data-swiped
        class={[
          "relative flex touch-pan-y items-center select-none",
          phone === undefined
            ? "gap-xs bg-card py-sm ps-md pe-2xs min-block-book-row"
            : phone.surface,
          isCapsule && "rounded-full",
          !swipe.isDragging &&
            "motion-safe:transition-transform motion-safe:duration-slide",
        ]}
        style:translate="{swipe.offsetOf(book.id)}px 0"
        onpointerdown={(event) => {
          if (event.currentTarget instanceof HTMLElement) {
            swipe.pressed(event, book.id, event.currentTarget);
          }
          longPress.pressed(event, () => {
            held(book);
          });
        }}
        onpointermove={(event) => {
          if (swipe.moved(event)) {
            releasePress();
          }
        }}
        onpointerupcapture={(event) => {
          const isRowGesture =
            swipe.isDragging ||
            swipe.isRevealed(book.id) ||
            (isContextMenu && menuFor === book.id);
          releasePress();
          swiped(
            book,
            swipe.released(
              phone?.isSwipeCapsule === true
                ? {
                    revealPx: () => capsuleRevealPx(event.currentTarget),
                    actPastOpenPx: CAPSULE_ACT_PAST_OPEN_PX,
                  }
                : undefined,
            ),
          );
          if (isRowGesture) {
            event.stopPropagation();
          }
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
        {#if phone === undefined}
          <a
            href={resolve("/read/[book]", { book: book.id })}
            draggable="false"
            class="flex flex-1 items-center self-stretch min-inline-none"
          >
            <BookRowText {book} />
          </a>
        {:else}
          <Item
            look="row"
            class={["self-stretch min-inline-none", ROW_FOCUS_RING]}
          >
            {#snippet child({ props })}
              <a
                {...props}
                href={resolve("/read/[book]", { book: book.id })}
                draggable="false"
              >
                <PhoneBookRowText
                  {book}
                  progress={phone.progress}
                  hasTwoLineTitle={hasTwoLineTitles}
                />
              </a>
            {/snippet}
          </Item>
        {/if}
        {#if phone?.more === "menu"}
          <BookMenu
            {book}
            phone={{ seriesTitle }}
            bind:open={
              () => menuFor === book.id,
              (isOpen: boolean) => {
                if (isOpen) {
                  menuFor = book.id;
                } else if (menuFor === book.id) {
                  menuFor = undefined;
                  isContextMenu = false;
                }
              }
            }
            isContext={isContextMenu && menuFor === book.id}
            onMark={(chosen: ReadMark) => {
              onMark([book.id], chosen);
            }}
            onSelect={() => {
              onStartPicking(book);
            }}
          />
        {:else}
          <BookSheet
            {book}
            isOnPhone={phone !== undefined}
            onMark={(chosen: ReadMark) => {
              onMark([book.id], chosen);
            }}
            onSelect={() => {
              onStartPicking(book);
            }}
          />
        {/if}
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

{#if phone === undefined}
  <Card class="overflow-hidden shadow-card-rest">
    <VirtualGrid
      {...grid}
      class="grid-cols-1"
      itemClass="border-be border-border last:border-be-0 ios-grouped:border-ios-separator"
    />
  </Card>
{:else}
  <div data-book-plate class={phone.plate}>
    <VirtualGrid {...grid} class="row-rules grid-cols-1" />
  </div>
{/if}
