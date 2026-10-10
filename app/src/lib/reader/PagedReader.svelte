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
  import { ReaderControls } from "#lib/reader/reader-controls.svelte.ts";
  import ReaderPanel from "#lib/reader/ReaderPanel.svelte";
  import ReaderTopBar from "#lib/reader/ReaderTopBar.svelte";
  import { isZoomedIn, zoneAction } from "#lib/reader/reader-zoom.ts";
  import {
    type ReadingCore,
    ReadingReport,
  } from "#lib/reader/reading-report.ts";
  import { Swipe, type SwipeTurn } from "#lib/reader/swipe.ts";
  import { utcOffsetMinutes } from "#lib/reader/utc-offset.ts";

  const SWIPE_MIN_PX = 48;
  const RESTING_SCALE = 1;
  /** Long enough that turning pages in a run announces only the page they stop on. */
  const ANNOUNCE_DELAY_MS = 300;
  const CONTROLS_HIDE_AFTER_MS = 3000;
  const TURN_STEPS = { next: 1, previous: -1 } as const satisfies Record<
    SwipeTurn,
    number
  >;

  const CORE: ReadingCore = {
    restored: (id, page) =>
      commands.readingRestored(id, page, utcOffsetMinutes(new Date())),
    shown: (id, page) =>
      commands.pageShown(id, page, utcOffsetMinutes(new Date())),
    closed: (id) => commands.closeBook(id),
  };

  let { book }: { book: OpenedBook } = $props();

  const screenshotMode = getScreenshotMode();
  const named = $derived(screenshotMode.isOn ? standInOpenedBook(book) : book);

  const turner = untrack(
    () => new PageTurner(book.pages.length, book.startPage),
  );
  const report = untrack(
    () =>
      new ReadingReport(book.id, CORE, (error) => {
        reportError(error);
      }),
  );
  const swipe = new Swipe(SWIPE_MIN_PX);
  const controls = new ReaderControls(CONTROLS_HIDE_AFTER_MS);
  let heading: HTMLHeadingElement | undefined = $state();
  let viewportScale = $state(RESTING_SCALE);

  const pageNumber = $derived(turner.shown + 1);
  const pageCount = $derived(book.pages.length);
  const pageLine = $derived(
    m.reader_slider_value({ page: pageNumber, count: pageCount }),
  );
  let announced = $state(untrack(() => pageLine));

  function isSliderFocused(): boolean {
    const focused = document.activeElement;
    return focused instanceof HTMLInputElement && focused.type === "range";
  }

  $effect(() => {
    const line = pageLine;
    const waiting = setTimeout(() => {
      if (!isSliderFocused()) {
        announced = line;
      }
    }, ANNOUNCE_DELAY_MS);
    return () => {
      clearTimeout(waiting);
    };
  });

  function act(action: ReaderAction): void {
    switch (action) {
      case "next":
        turnBy(1);
        return;
      case "previous":
        turnBy(-1);
        return;
      case "first":
        turnTo(0);
        return;
      case "last":
        turnTo(pageCount - 1);
        return;
      case "toggleControls":
        controls.toggle();
        return;
      case "fullScreen":
        void commands.changeFullScreen("toggle");
        return;
      case "leave":
        void leaveFullScreenOrBook();
        return;
    }
  }

  function turnBy(step: number): void {
    turner.turn(step);
    controls.hide();
  }

  function turnTo(index: number): void {
    turner.goTo(index);
    controls.hide();
  }

  /** Shows the controls for a focused control, holding them up only while it was focused from the keyboard, and never for the heading focused as the book opens. */
  function onControlFocus(event: FocusEvent): void {
    const { target } = event;
    if (!(target instanceof HTMLElement) || target.tabIndex < 0) {
      return;
    }
    if (target.matches(":focus-visible")) {
      controls.focused();
    } else {
      controls.show();
    }
  }

  async function leaveFullScreenOrBook(): Promise<void> {
    const left = await commands.changeFullScreen("leave");
    if (left.status === "ok" && left.data) {
      return;
    }
    await goto(resolve("/(app)"));
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
  function onZone(event: MouseEvent, zone: ReaderAction): void {
    if (isPointerClick(event) && event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    const action = zoneAction(zone, viewportScale);
    if (!swipe.isClickASwipe() && action !== undefined) {
      act(action);
    }
  }

  function isPointerClick(event: MouseEvent): boolean {
    return event.detail > 0;
  }

  const controlEvents = {
    onpointerenter: () => {
      controls.pointerEntered();
    },
    onpointerleave: () => {
      controls.pointerLeft();
    },
    onfocusin: onControlFocus,
    onfocusout: () => {
      controls.blurred();
    },
  };

  function onSwipeEnd(event: PointerEvent): void {
    const turn = swipe.ended(event);
    if (turn !== undefined && !isZoomedIn(viewportScale)) {
      turnBy(TURN_STEPS[turn]);
    }
  }

  $effect(() => {
    report.show(turner.shown);
  });

  onMount(() => {
    heading?.focus();
    return () => {
      controls.stop();
    };
  });

  onMount(() => {
    const viewport = window.visualViewport;
    const followScale = (): void => {
      viewportScale = viewport?.scale ?? viewportScale;
    };
    followScale();
    viewport?.addEventListener("resize", followScale);
    return () => {
      viewport?.removeEventListener("resize", followScale);
      report.close();
    };
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
    class={[
      "absolute inset-none flex",
      isZoomedIn(viewportScale)
        ? "touch-manipulation"
        : "touch-pan-y touch-pinch-zoom",
    ]}
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
      aria-label={controls.isShown
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
      !controls.isShown && "pointer-events-none opacity-0",
    ]}
    {...controlEvents}
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
      !controls.isShown && "pointer-events-none opacity-0",
    ]}
    {...controlEvents}
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
  <p role="status" class="sr-only">{announced}</p>
</main>
