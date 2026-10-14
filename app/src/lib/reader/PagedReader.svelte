<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { commands, type OpenedBook } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { standInOpenedBook } from "#lib/series/series-stand-ins.ts";
  import { shortcut } from "#lib/shortcut.ts";

  import DirectionMenu from "#lib/reader/DirectionMenu.svelte";
  import { PageTurner } from "#lib/reader/page-turner.svelte.ts";
  import PageStack from "#lib/reader/PageStack.svelte";
  import {
    type ReaderAction,
    readerShortcuts,
  } from "#lib/reader/reader-keys.ts";
  import { ReaderControls } from "#lib/reader/reader-controls.svelte.ts";
  import ReaderPanel from "#lib/reader/ReaderPanel.svelte";
  import ReaderTopBar from "#lib/reader/ReaderTopBar.svelte";
  import { isZoomedIn, zoneAction } from "#lib/reader/reader-zoom.ts";
  import {
    type ReadingCore,
    ReadingReport,
  } from "#lib/reader/reading-report.ts";
  import {
    inReadingOrder,
    type PageTurn,
    seriesReadingDirection,
  } from "#lib/reader/reading-direction.svelte.ts";
  import { Swipe } from "#lib/reader/swipe.ts";
  import UpcomingQuickSettings from "#lib/reader/UpcomingQuickSettings.svelte";
  import { utcOffsetMinutes } from "#lib/reader/utc-offset.ts";
  import { getSkipUpNextSetting } from "#lib/up-next/skip-up-next.svelte.ts";
  import UpNext from "#lib/up-next/UpNext.svelte";

  const SWIPE_MIN_PX = 48;
  const RESTING_SCALE = 1;
  /** Long enough that turning pages in a run announces only the page they stop on. */
  const ANNOUNCE_DELAY_MS = 300;
  const CONTROLS_HIDE_AFTER_MS = 3000;
  /** How near the window's top or bottom the pointer brings hidden controls back. */
  const REVEAL_EDGE_PX = 48;
  const TURN_STEPS = { next: 1, previous: -1 } as const satisfies Record<
    PageTurn,
    number
  >;
  const TURN_LABELS = {
    next: m.reader_next_page,
    previous: m.reader_previous_page,
  } satisfies Record<PageTurn, () => string>;

  const CORE: ReadingCore = {
    restored: (id, page) =>
      commands.readingRestored(id, page, utcOffsetMinutes(new Date())),
    shown: (id, page) =>
      commands.pageShown(id, page, utcOffsetMinutes(new Date())),
    closed: (id) => commands.closeBook(id),
  };

  let { book, opensAtEnd }: { book: OpenedBook; opensAtEnd: boolean } =
    $props();

  const screenshotMode = getScreenshotMode();
  const named = $derived(screenshotMode.isOn ? standInOpenedBook(book) : book);

  const turner = untrack(
    () =>
      new PageTurner(
        book.pages.length,
        opensAtEnd ? book.pages.length - 1 : book.startPage,
      ),
  );
  const report = untrack(
    () =>
      new ReadingReport(book.id, CORE, (error) => {
        reportError(error);
      }),
  );
  const swipe = new Swipe(SWIPE_MIN_PX);
  const controls = new ReaderControls(CONTROLS_HIDE_AFTER_MS);
  const skipUpNext = getSkipUpNextSetting();
  const notices = getNotices();
  const reading = untrack(() =>
    seriesReadingDirection(book.series, book.readingDirection),
  );
  const leftTurn = $derived(inReadingOrder("previous", reading.direction));
  const rightTurn = $derived(inReadingOrder("next", reading.direction));
  let heading: HTMLHeadingElement | undefined = $state();
  let viewportScale = $state(RESTING_SCALE);

  const pageNumber = $derived(turner.shown + 1);
  const pageCount = $derived(book.pages.length);
  const pageLine = $derived(
    m.reader_slider_value({ page: pageNumber, count: pageCount }),
  );
  const seriesHref = $derived(
    resolve("/(app)/series/[id]", { id: book.series }),
  );
  const nextHref = $derived(
    book.next === null
      ? undefined
      : resolve("/read/[book]", { book: book.next.id }),
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
    if (step > 0 && turner.isPastEnd) {
      startNextBook();
      return;
    }
    turner.turn(step);
    controls.hide();
    if (turner.isPastEnd && skipUpNext.isOn) {
      goStraightOn();
    }
  }

  function startNextBook(): void {
    if (nextHref !== undefined) {
      void goto(nextHref, { replaceState: true });
    }
  }

  function goStraightOn(): void {
    if (named.next === null) {
      return;
    }
    const finished = resolve("/read/[book]", { book: book.id });
    startNextBook();
    notices.offerUndo({
      title: m.reader_now_reading({ title: named.next.title }),
      undo: () => {
        void goto(finished, {
          replaceState: true,
          state: { readerOpensAtEnd: true },
        });
      },
    });
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
    await goto(seriesHref);
  }

  function isAtRevealEdge(event: PointerEvent): boolean {
    return (
      event.pointerType === "mouse" &&
      (event.clientY < REVEAL_EDGE_PX ||
        event.clientY > window.innerHeight - REVEAL_EDGE_PX)
    );
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
      turnBy(TURN_STEPS[inReadingOrder(turn, reading.direction)]);
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

<svelte:window
  {@attach shortcut(...readerShortcuts(act, () => reading.direction))}
/>

{#snippet quickSettings()}
  <DirectionMenu
    {reading}
    onOpenChange={(isOpen: boolean) => {
      if (isOpen) {
        controls.hold();
      } else {
        controls.release();
      }
    }}
  />
  <UpcomingQuickSettings />
{/snippet}

<main
  class="fixed inset-none overflow-hidden bg-reader text-on-reader expanded:bg-reader-wide"
  onpointermove={(event) => {
    if (isAtRevealEdge(event)) {
      controls.show();
    }
  }}
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
      aria-label={TURN_LABELS[leftTurn]()}
      class="shrink-0 cursor-w-resize inline-3/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent expanded:inline-1/3"
      onclick={(event) => {
        onZone(event, leftTurn);
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
      aria-label={TURN_LABELS[rightTurn]()}
      class="shrink-0 cursor-e-resize inline-3/10 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent expanded:inline-1/3"
      onclick={(event) => {
        onZone(event, rightTurn);
      }}
    ></button>
  </div>
  <h1 bind:this={heading} tabindex="-1" class="sr-only">{named.title}</h1>
  {#if turner.isPastEnd}
    <UpNext
      book={book.id}
      title={named.title}
      seriesTitle={named.seriesTitle}
      {seriesHref}
      next={named.next}
      {nextHref}
    />
  {:else}
    <header
      class={[
        "absolute inset-x-reader-bar-inline inset-bs-reader-bar-top transition-all motion-safe:duration-fade motion-safe:ease-out expanded:inset-x-lg expanded:inset-bs-md",
        !controls.isShown && "pointer-events-none opacity-0",
      ]}
      {...controlEvents}
    >
      <ReaderTopBar
        {seriesHref}
        seriesTitle={named.seriesTitle}
        bookTitle={named.title}
        {quickSettings}
        onFullScreen={() => {
          act("fullScreen");
        }}
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
        direction={reading.direction}
        {quickSettings}
        onSeek={(index: number) => {
          turner.goTo(index);
        }}
      />
    </div>
    {#if !controls.isShown}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-none inset-be-reader-bar-bottom flex justify-center"
      >
        <span
          class="rounded-full bg-reader-glass px-sm py-2xs text-caption font-semibold text-reader-muted tabular-nums"
          >{m.reader_position({ page: pageNumber, count: pageCount })}</span
        >
      </div>
    {/if}
  {/if}
  <p role="status" class="sr-only">{announced}</p>
</main>
