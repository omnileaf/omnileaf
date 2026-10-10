<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { commands, type OpenedBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { standInOpenedBook } from "#lib/series/series-stand-ins.ts";

  import { PageTurner } from "#lib/reader/page-turner.svelte.ts";
  import PageStack from "#lib/reader/PageStack.svelte";
  import {
    isKeyForFocusedControl,
    type ReaderAction,
    readerActionFor,
  } from "#lib/reader/reader-keys.ts";
  import ReaderPanel from "#lib/reader/ReaderPanel.svelte";
  import ReaderTopBar from "#lib/reader/ReaderTopBar.svelte";
  import { Swipe, type SwipeTurn } from "#lib/reader/swipe.ts";

  const SWIPE_MIN_PX = 48;
  const TURN_STEPS = { next: 1, previous: -1 } as const satisfies Record<
    SwipeTurn,
    number
  >;

  let { book }: { book: OpenedBook } = $props();

  const screenshotMode = getScreenshotMode();
  const named = $derived(screenshotMode.isOn ? standInOpenedBook(book) : book);

  const turner = untrack(
    () => new PageTurner(book.pages.length, book.startPage),
  );
  const swipe = new Swipe(SWIPE_MIN_PX);
  let areControlsShown = $state(true);
  let heading: HTMLHeadingElement | undefined = $state();

  const pageNumber = $derived(turner.shown + 1);
  const pageCount = $derived(book.pages.length);

  function act(action: ReaderAction): void {
    switch (action) {
      case "next":
        turner.turn(1);
        return;
      case "previous":
        turner.turn(-1);
        return;
      case "first":
        turner.goTo(0);
        return;
      case "last":
        turner.goTo(pageCount - 1);
        return;
      case "toggleControls":
        areControlsShown = !areControlsShown;
        return;
      case "fullScreen":
        void commands.changeFullScreen("toggle");
        return;
      case "close":
        void goto(resolve("/(app)"));
        return;
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || isKeyForFocusedControl(event)) {
      return;
    }
    const action = readerActionFor(event);
    if (action === undefined) {
      return;
    }
    event.preventDefault();
    act(action);
  }

  /** Leaves no tapped zone focused, so Space goes on turning pages rather than pressing the zone tapped last. */
  function onZone(event: MouseEvent, action: ReaderAction): void {
    if (isPointerClick(event) && event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    if (!swipe.isClickASwipe()) {
      act(action);
    }
  }

  function isPointerClick(event: MouseEvent): boolean {
    return event.detail > 0;
  }

  function onSwipeEnd(event: PointerEvent): void {
    const turn = swipe.ended(event);
    if (turn !== undefined) {
      turner.turn(TURN_STEPS[turn]);
    }
  }

  onMount(() => {
    heading?.focus();
  });
</script>

<svelte:window onkeydown={onKey} />

<main
  class="fixed inset-none overflow-hidden bg-reader text-on-reader expanded:bg-reader-wide"
>
  <PageStack pages={book.pages} shown={turner.shown} />
  <div
    dir="ltr"
    role="presentation"
    class="absolute inset-none flex touch-pan-y touch-pinch-zoom"
    onpointerdown={(event) => {
      swipe.started(event);
    }}
    onpointerup={onSwipeEnd}
    onpointercancel={() => {
      swipe.cancelled();
    }}
  >
    <button
      type="button"
      aria-label={m.reader_previous_page()}
      class="shrink-0 cursor-w-resize inline-3/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent expanded:inline-1/3"
      onclick={(event) => {
        onZone(event, "previous");
      }}
    ></button>
    <button
      type="button"
      aria-label={areControlsShown
        ? m.reader_hide_controls()
        : m.reader_show_controls()}
      class="flex-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
      onclick={(event) => {
        onZone(event, "toggleControls");
      }}
    ></button>
    <button
      type="button"
      aria-label={m.reader_next_page()}
      class="shrink-0 cursor-e-resize inline-3/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent expanded:inline-1/3"
      onclick={(event) => {
        onZone(event, "next");
      }}
    ></button>
  </div>
  <header
    class={[
      "absolute inset-x-reader-bar-inline inset-bs-reader-bar-top transition-all motion-safe:duration-fade motion-safe:ease-out expanded:inset-x-lg expanded:inset-bs-md",
      !areControlsShown && "invisible opacity-0",
    ]}
  >
    <ReaderTopBar
      seriesTitle={named.seriesTitle}
      bookLine={m.reader_book_line({
        title: named.title,
        page: pageNumber,
        count: pageCount,
      })}
      onFullScreen={() => {
        act("fullScreen");
      }}
      bind:heading
    />
  </header>
  <div
    class={[
      "absolute inset-x-reader-bar-inline inset-be-reader-bar-bottom transition-all motion-safe:duration-fade motion-safe:ease-out expanded:inset-x-lg expanded:inset-be-lg expanded:mx-auto expanded:max-inline-reader-dock",
      !areControlsShown && "invisible opacity-0",
    ]}
  >
    <ReaderPanel
      pages={book.pages}
      shown={turner.shown}
      previous={named.previous}
      next={named.next}
      onSeek={(index: number) => {
        turner.goTo(index);
      }}
    />
  </div>
  <p role="status" class="sr-only">
    {m.reader_slider_value({ page: pageNumber, count: pageCount })}
  </p>
</main>
