<script lang="ts">
  import {
    BookmarkX,
    BookOpen,
    Eye,
    Maximize,
    Languages,
  } from "@lucide/svelte";
  import { onMount, tick, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { SvelteSet } from "svelte/reactivity";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type OpenedBook,
    type Platform,
  } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { getSmartFeatures } from "#lib/reader/smart-features.svelte.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { standInOpenedBook } from "#lib/series/series-stand-ins.ts";
  import { shortcut } from "#lib/shortcut.ts";

  import DirectionMenu from "#lib/reader/DirectionMenu.svelte";
  import { PageTurner } from "#lib/reader/page-turner.svelte.ts";
  import PageStack from "#lib/reader/PageStack.svelte";
  import AutoScrollBar from "#lib/reader/AutoScrollBar.svelte";
  import {
    autoScrollSpeed,
    fasterSpeed,
    pixelsScrolled,
    slowerSpeed,
  } from "#lib/reader/auto-scroll.ts";
  import StripFoundCard from "#lib/reader/StripFoundCard.svelte";
  import StripStack from "#lib/reader/StripStack.svelte";
  import {
    type ReaderAction,
    readerShortcuts,
  } from "#lib/reader/reader-keys.ts";
  import { ReaderControls } from "#lib/reader/reader-controls.svelte.ts";
  import LightQuickSetting from "#lib/reader/LightQuickSetting.svelte";
  import {
    type PageFit,
    type PageLayout,
    type ReaderLight,
    readerSettings,
  } from "#lib/reader/reader-settings.svelte.ts";
  import ReaderMore from "#lib/reader/ReaderMore.svelte";
  import { makesToastRoom } from "#lib/reader/toast-room.ts";
  import { spreadAt, spreadPosition, spreadsOf } from "#lib/reader/spreads.ts";
  import LayoutQuickSettings from "#lib/reader/LayoutQuickSettings.svelte";
  import JumpToBook from "#lib/reader/JumpToBook.svelte";
  import KeyboardShortcuts from "#lib/reader/KeyboardShortcuts.svelte";
  import { fitPinch } from "#lib/reader/pinch-zoom.ts";
  import ReaderGuide from "#lib/reader/ReaderGuide.svelte";
  import ReadingSettings from "#lib/reader/ReadingSettings.svelte";
  import { seenOnce } from "#lib/reader/seen-once.ts";
  import { tapZonesFor } from "#lib/reader/tap-zones.ts";
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
  import { pagesLookLikeStrip } from "#lib/reader/strip-pages.ts";
  import { Swipe } from "#lib/reader/swipe.ts";
  import { utcOffsetMinutes } from "#lib/reader/utc-offset.ts";
  import { getSkipUpNextSetting } from "#lib/up-next/skip-up-next.svelte.ts";
  import UpNext from "#lib/up-next/UpNext.svelte";

  const SWIPE_MIN_PX = 48;
  const STRIP_GUIDE_KEY = "omnileaf.readerGuide.strip";
  const RESTING_SCALE = 1;
  /** Long enough that turning pages in a run announces only the page they stop on. */
  const ANNOUNCE_DELAY_MS = 300;
  const CONTROLS_HIDE_AFTER_MS = 3000;
  /** The button a mouse's back button reports, which browsers otherwise take as going back through history. */
  const MOUSE_BACK_BUTTON = 3;
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

  let {
    book,
    platform,
    opensAtEnd,
    hasJumped,
  }: {
    book: OpenedBook;
    platform: Platform;
    opensAtEnd: boolean;
    hasJumped: boolean;
  } = $props();

  const screenshotMode = getScreenshotMode();
  const smartFeatures = getSmartFeatures();
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
  let slide = $state(0);
  let isSettling = $state(false);
  const controls = new ReaderControls(CONTROLS_HIDE_AFTER_MS);
  let hasOpened = false;
  const skipUpNext = getSkipUpNextSetting();
  const notices = getNotices();
  const reading = untrack(() =>
    seriesReadingDirection(
      book.series,
      book.readingDirection,
      smartFeatures.choosesReadingMode ? pagesLookLikeStrip(book.pages) : false,
    ),
  );
  const settings = untrack(() => readerSettings(book.series));
  const guidesSeenNow = new SvelteSet<string>();
  const guideKey = $derived(
    reading.mode === "longStrip"
      ? STRIP_GUIDE_KEY
      : settings.look.tapZones === "edges"
        ? `omnileaf.readerGuide.${reading.direction}`
        : `omnileaf.readerGuide.zones.${settings.look.tapZones}`,
  );
  const isGuideSeen = $derived(
    guidesSeenNow.has(guideKey) || seenOnce(guideKey).isSeen,
  );
  const look = $derived(settings.look);
  const isStrip = $derived(reading.mode === "longStrip");
  const stripFound = untrack(() =>
    seenOnce(`omnileaf.stripFound.${book.series}`),
  );
  let isStripFoundSeen = $state(stripFound.isSeen);

  function seeStripFound(): void {
    stripFound.see();
    isStripFoundSeen = true;
  }
  let strip:
    | {
        scrollByScreen: (step: number) => boolean;
        scrollByPixels: (pixels: number) => boolean;
        shownPageHeight: () => number;
      }
    | undefined = $state();
  let autoScroll: "off" | "running" | "paused" = $state("off");
  let isTouchPausing = false;
  const canUseMyPace = $derived(
    smartFeatures.autoScrollsAtMyPace && book.secondsPerPage !== null,
  );
  const scrollSpeed = $derived(
    autoScrollSpeed({
      choice: canUseMyPace ? look.autoScrollSpeed : "set",
      pagesPerMinute: look.pagesPerMinute,
      secondsPerPage: book.secondsPerPage,
    }),
  );
  let isSettingsOpen = $state(false);
  let areShortcutsOpen = $state(false);
  let isJumpOpen = $state(false);
  const isPanelOpen = $derived(isSettingsOpen || isJumpOpen);
  let zoom = $state(1);
  const ZOOM_STEP = 1.25;
  const ZOOM_MOST = 4;
  const ZOOM_DOUBLE = 2;
  const percent = new Intl.NumberFormat(getLocale(), { style: "percent" });
  const BACKGROUNDS = {
    black: "bg-reader-black",
    grey: "bg-reader-grey",
    white: "bg-reader-white",
  } as const;
  /** How far Light dims a page at its lowest brightness and tints it at its warmest. */
  const DIMMEST = 0.8;
  const WARMEST = 0.35;
  const leftTurn = $derived(inReadingOrder("previous", reading.direction));
  const rightTurn = $derived(inReadingOrder("next", reading.direction));
  const zoneLayout = $derived(tapZonesFor(look.tapZones, leftTurn, rightTurn));
  let heading: HTMLHeadingElement | undefined = $state();
  let viewportScale = $state(RESTING_SCALE);

  const spreads = $derived(
    spreadsOf(
      book.pages.map((page) => page.size),
      !isStrip && look.layout === "two",
    ),
  );
  const spreadIndex = $derived(spreadAt(spreads, turner.shown));
  const spread = $derived(spreads[spreadIndex] ?? [turner.shown]);
  const bookmarks = untrack(() =>
    book.bookmarkedPages === null
      ? null
      : new SvelteSet<number>(book.bookmarkedPages),
  );
  const isBookmarked = $derived(
    spread.some((page) => bookmarks?.has(page) === true),
  );
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

  async function markRead(): Promise<void> {
    const marked = await commands.markBooks([book.id], "read");
    if (marked.status === "error") {
      reportError(marked.error);
      return;
    }
    notices.show({ tone: "plain", icon: Eye, title: m.reader_marked_read() });
  }

  function openJump(isOpen: boolean): void {
    if (isOpen) {
      openSettings(false);
    }
    isJumpOpen = isOpen;
    holdControls(isOpen);
  }

  function openSettings(isOpen: boolean): void {
    if (isOpen) {
      isJumpOpen = false;
    }
    isSettingsOpen = isOpen;
    holdControls(isOpen);
  }

  function holdControls(isOpen: boolean): void {
    if (isOpen) {
      controls.hold();
    } else {
      controls.release();
    }
  }

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

  function startAutoScroll(): void {
    autoScroll = "running";
    controls.hide();
    heading?.focus();
  }

  function toggleAutoScroll(): void {
    autoScroll = autoScroll === "running" ? "paused" : "running";
  }

  function reachStripEnd(): void {
    if (look.pausesAtEnd) {
      autoScroll = "paused";
      return;
    }
    autoScroll = "off";
    act("next");
  }

  function pauseOnTouch(): void {
    if (autoScroll === "running") {
      autoScroll = "paused";
      isTouchPausing = true;
    }
  }

  function onStripZone(event: MouseEvent, zone: ReaderAction): void {
    if (isTouchPausing) {
      isTouchPausing = false;
      return;
    }
    onZone(event, zone);
  }

  $effect(() => {
    if (autoScroll !== "running") {
      return;
    }
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const elapsed = now - last;
      last = now;
      const pixels = pixelsScrolled(
        elapsed,
        scrollSpeed.pagesPerMinute,
        strip?.shownPageHeight() ?? 0,
      );
      if (strip?.scrollByPixels(pixels) === false) {
        reachStripEnd();
        return;
      }
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  function act(action: ReaderAction): void {
    switch (action) {
      case "toggleAutoScroll":
        toggleAutoScroll();
        return;
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
        void toggleFullScreen();
        return;
      case "zoomIn":
        zoomTo(zoom * ZOOM_STEP);
        return;
      case "zoomOut":
        zoomTo(zoom / ZOOM_STEP);
        return;
      case "zoomFit":
        zoomTo(1);
        return;
      case "back":
        void goto(seriesHref);
        return;
      case "jump":
        openJump(!isJumpOpen);
        return;
      case "shortcuts":
        areShortcutsOpen = !areShortcutsOpen;
        holdControls(areShortcutsOpen);
        return;
      case "leave":
        if (isJumpOpen) {
          openJump(false);
          return;
        }
        if (isSettingsOpen) {
          openSettings(false);
          return;
        }
        void leaveFullScreenOrBook();
        return;
    }
  }

  function turnBy(step: number): void {
    if (isStrip && !turner.isPastEnd) {
      scrollBy(step);
      return;
    }
    if (step > 0 && turner.isPastEnd) {
      startNextBook();
      return;
    }
    const target = spreads[spreadIndex + step];
    if (turner.isPastEnd) {
      turner.turn(step);
    } else if (target !== undefined) {
      turner.goTo(target[0] ?? turner.shown);
    } else if (step > 0) {
      turner.goTo(pageCount - 1);
      turner.turn(1);
    }
    zoom = 1;
    controls.hide();
    if (turner.isPastEnd && skipUpNext.isOn) {
      goStraightOn();
    }
  }

  function scrollBy(step: number): void {
    controls.hide();
    if (strip?.scrollByScreen(step) !== false || step < 0) {
      return;
    }
    turner.goTo(pageCount - 1);
    turner.turn(1);
    if (skipUpNext.isOn) {
      goStraightOn();
    }
  }

  function startNextBook(): void {
    void goto(nextHref ?? seriesHref, { replaceState: nextHref !== undefined });
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

  function pagesWord(pages: readonly number[], isBookmarked: boolean): string {
    const first = String((pages[0] ?? 0) + 1);
    const last = String((pages.at(-1) ?? 0) + 1);
    if (pages.length === 1) {
      return isBookmarked
        ? m.reader_page_bookmarked({ page: first })
        : m.reader_page_bookmark_removed({ page: first });
    }
    return isBookmarked
      ? m.reader_pages_bookmarked({ first, last })
      : m.reader_pages_bookmark_removed({ first, last });
  }

  async function keepBookmarks(
    kept: SvelteSet<number>,
    pages: readonly number[],
    isOn: boolean,
  ): Promise<boolean> {
    const mark = (on: boolean): void => {
      for (const page of pages) {
        if (on) {
          kept.add(page);
        } else {
          kept.delete(page);
        }
      }
    };
    mark(isOn);
    const saved = await commands.bookmarkPages(book.id, [...pages], isOn);
    if (saved.status === "error") {
      mark(!isOn);
      reportError(saved.error);
      notices.show({
        tone: "warning",
        icon: BookmarkX,
        title: m.reader_bookmark_failed(),
        body: m.reader_bookmark_failed_body(),
      });
      return false;
    }
    return true;
  }

  async function toggleBookmark(): Promise<void> {
    if (bookmarks === null) {
      return;
    }
    const isOn = !isBookmarked;
    const pages = spread.filter((page) => bookmarks.has(page) !== isOn);
    if (await keepBookmarks(bookmarks, pages, isOn)) {
      notices.offerUndo({
        title: pagesWord(pages, isOn),
        undo: () => {
          void keepBookmarks(bookmarks, pages, !isOn);
        },
      });
    }
  }

  function zoomTo(scale: number): void {
    zoom = Math.min(ZOOM_MOST, Math.max(1, scale));
    controls.hide();
  }

  /** Takes Ctrl and the wheel as zoom, which the webview would otherwise give to its own zoom. */
  const zoomsOnWheel: Attachment<HTMLElement> = (element) =>
    on(
      element,
      "wheel",
      (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          zoomTo(event.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
        }
      },
      { passive: false },
    );

  function turnTo(index: number): void {
    turner.goTo(index);
    zoom = 1;
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

  async function toggleFullScreen(): Promise<void> {
    const changed = await commands.changeFullScreen("toggle");
    if (changed.status === "ok" && !changed.data) {
      notices.show({
        tone: "plain",
        icon: Maximize,
        title: m.reader_full_screen(),
        body: m.reader_full_screen_leave(),
      });
    }
  }

  function sayWhereItOpened(): void {
    if (opensAtEnd) {
      return;
    }
    if (book.startPage === 0) {
      if (hasJumped) {
        notices.show({
          tone: "plain",
          icon: BookOpen,
          title: m.reader_starting({ title: named.title }),
          body: m.reader_page_of({ page: 1, count: pageCount }),
        });
      }
      return;
    }
    notices.show({
      tone: "plain",
      icon: BookOpen,
      title: m.reader_back_on_page({
        page: book.startPage + 1,
        count: pageCount,
      }),
      ...(hasJumped ? { body: named.title } : {}),
      action: {
        label: m.reader_start_over(),
        run: () => {
          turnTo(0);
        },
      },
    });
  }

  function sayDirectionFound(): void {
    const noticed = seenOnce(`omnileaf.directionFound.${book.series}`);
    if (
      noticed.isSeen ||
      !reading.isDetected ||
      reading.direction !== "rightToLeft"
    ) {
      return;
    }
    noticed.see();
    notices.show({
      tone: "plain",
      icon: Languages,
      title: m.reader_reading_right_to_left(),
      body: m.reader_found_in_details(),
      action: {
        label: m.reader_change(),
        run: () => {
          openSettings(true);
        },
      },
    });
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

  let lastPointer = { x: Number.NaN, y: Number.NaN };

  /** WebKit sends a pointermove whenever the page scrolls under a pointer that hasn't moved, so only a change of position counts. */
  function hasPointerMoved(event: PointerEvent): boolean {
    const moved =
      event.clientX !== lastPointer.x || event.clientY !== lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    return moved;
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

  function onSwipeMove(event: PointerEvent): void {
    if (look.pageTurn === "slide" && !isZoomedIn(viewportScale)) {
      isSettling = false;
      slide = swipe.moved(event) ?? 0;
    }
  }

  function onSwipeEnd(
    event: PointerEvent & { currentTarget: HTMLElement },
  ): void {
    const turn = swipe.ended(event);
    const before = turner.shown;
    if (turn !== undefined && !isZoomedIn(viewportScale)) {
      turnBy(TURN_STEPS[inReadingOrder(turn, reading.direction)]);
    }
    if (turner.shown === before || slide === 0) {
      settleSlide();
    } else {
      slideIn(event.currentTarget.clientWidth);
    }
  }

  function settleSlide(): void {
    isSettling = slide !== 0;
    slide = 0;
  }

  function slideIn(width: number): void {
    isSettling = false;
    slide = slide < 0 ? slide + width : slide - width;
    requestAnimationFrame(() => {
      requestAnimationFrame(settleSlide);
    });
  }

  $effect(() => {
    report.show(turner.shown);
  });

  /** The webview lets a wake lock go whenever the reader is out of sight, so it asks again on coming back. */
  function keepScreenOn(): () => void {
    let lock: WakeLockSentinel | undefined;
    let isKept = true;
    const ask = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      navigator.wakeLock.request("screen").then(
        (granted) => {
          if (isKept) {
            lock = granted;
          } else {
            void granted.release();
          }
        },
        () => undefined,
      );
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      isKept = false;
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }

  $effect(() => {
    if (look.keepsScreenOn && "wakeLock" in navigator) {
      return keepScreenOn();
    }
    return undefined;
  });

  onMount(() => {
    if (!isGuideSeen) {
      controls.hide();
    }
    sayWhereItOpened();
    sayDirectionFound();
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
  {@attach shortcut(
    ...readerShortcuts(
      act,
      () => reading.direction,
      platform,
      reading.mode,
      autoScroll !== "off",
    ),
  )}
  onmouseup={(event: MouseEvent) => {
    if (event.button === MOUSE_BACK_BUTTON) {
      event.preventDefault();
      act("back");
    }
  }}
/>

{#snippet quickSettings()}
  <DirectionMenu
    {reading}
    seriesTitle={named.seriesTitle}
    onOpenChange={holdControls}
  />
  <LayoutQuickSettings
    layout={look.layout}
    fit={look.fit}
    onLayout={(layout: PageLayout) => {
      settings.change("layout", layout);
    }}
    onFit={(fit: PageFit) => {
      settings.change("fit", fit);
    }}
  />
  <LightQuickSetting
    light={look.light}
    onChange={(light: ReaderLight) => {
      settings.change("light", light);
    }}
    onOpenChange={holdControls}
  />
{/snippet}

{#snippet more()}
  <ReaderMore
    title={named.title}
    {platform}
    onMarkRead={() => {
      void markRead();
    }}
    onStartOver={() => {
      turner.goTo(0);
    }}
    onOpenChange={holdControls}
  />
{/snippet}

{#snippet stripZones()}
  <div
    role="presentation"
    data-tap-zones
    class="absolute inset-none grid touch-pan-y touch-pinch-zoom grid-strip-zones"
    onpointerdown={pauseOnTouch}
  >
    {#if look.tapToScroll === "topAndBottom"}
      <button
        type="button"
        aria-label={m.reader_scroll_up()}
        class="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
        onclick={(event) => {
          onStripZone(event, "previous");
        }}
      ></button>
    {:else}
      <span></span>
    {/if}
    <button
      type="button"
      aria-label={controls.isShown
        ? m.reader_hide_controls()
        : m.reader_show_controls()}
      class="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
      onclick={(event) => {
        onStripZone(event, "toggleControls");
      }}
    ></button>
    {#if look.tapToScroll === "topAndBottom"}
      <button
        type="button"
        aria-label={m.reader_scroll_down()}
        class="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
        onclick={(event) => {
          onStripZone(event, "next");
        }}
      ></button>
    {/if}
  </div>
{/snippet}

{#snippet turnZones()}
  <div
    dir="ltr"
    role="presentation"
    data-tap-zones
    class={[
      "absolute inset-none",
      look.tapZones === "lShape" ? "grid grid-l-zones" : "flex",
      isZoomedIn(viewportScale)
        ? "touch-manipulation"
        : "touch-pan-y touch-pinch-zoom",
    ]}
    onpointerdown={(event) => {
      swipe.started(event);
    }}
    onpointermove={onSwipeMove}
    onpointerup={onSwipeEnd}
    onpointercancel={() => {
      swipe.cancelled();
      settleSlide();
    }}
  >
    {#each zoneLayout as zone, index (index)}
      {#if zone.kind === "turn"}
        <button
          type="button"
          aria-label={TURN_LABELS[zone.turn]()}
          class={[
            "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent",
            zone.shape,
          ]}
          onclick={(event) => {
            onZone(event, zone.turn);
          }}
        ></button>
      {:else}
        <button
          type="button"
          aria-label={controls.isShown
            ? m.reader_hide_controls()
            : m.reader_show_controls()}
          class="flex-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
          onclick={(event) => {
            onZone(event, "toggleControls");
          }}
          ondblclick={() => {
            if (isZoomedIn(viewportScale)) {
              fitPinch();
            } else {
              zoomTo(zoom > 1 ? 1 : ZOOM_DOUBLE);
            }
          }}
        ></button>
      {/if}
    {/each}
  </div>
{/snippet}

<main
  {@attach zoomsOnWheel}
  data-theme={look.controls === "dark" ? "dark" : undefined}
  class={[
    "fixed inset-none overflow-hidden text-on-reader",
    BACKGROUNDS[look.background],
  ]}
  onpointermove={(event) => {
    if (hasPointerMoved(event) && isAtRevealEdge(event)) {
      controls.show();
    }
  }}
>
  <div
    class={[
      "absolute inset-none",
      isPanelOpen && "expanded:inset-e-reader-settings-room",
    ]}
  >
    {#if isStrip}
      <StripStack
        bind:this={strip}
        pages={book.pages}
        shown={turner.shown}
        isBlank={screenshotMode.isOn && screenshotMode.options.blankReaderPages}
        marks={bookmarks === null ? [] : [...bookmarks]}
        overlay={stripZones}
        onShown={(index: number) => {
          turner.goTo(index);
        }}
        onShownReady={() => {
          if (!hasOpened) {
            hasOpened = true;
            controls.bookOpened();
          }
        }}
      />
    {:else}
      <PageStack
        pages={book.pages}
        shown={turner.shown}
        {spread}
        fit={look.fit}
        {zoom}
        isReversed={reading.direction === "rightToLeft"}
        overlay={turnZones}
        bookTitle={named.title}
        isBlank={screenshotMode.isOn && screenshotMode.options.blankReaderPages}
        {slide}
        {isSettling}
        onNextPage={() => {
          act("next");
        }}
        onShownReady={() => {
          if (!hasOpened) {
            hasOpened = true;
            controls.bookOpened();
          }
        }}
      />
    {/if}
    {#if look.light.isOn}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-none bg-reader-black"
        style:opacity={((100 - look.light.brightness) / 100) * DIMMEST}
      ></div>
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-none bg-reader-warmth mix-blend-multiply"
        style:opacity={(look.light.warmth / 100) * WARMEST}
      ></div>
    {/if}
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
      direction={reading.direction}
    />
  {:else}
    <header
      class={[
        "absolute inset-x-reader-bar-inline inset-bs-reader-bar-top transition-all expanded:inset-x-lg expanded:inset-bs-md motion-reader:duration-fade motion-reader:ease-out",
        !controls.isShown && "pointer-events-none opacity-0",
      ]}
      {...controlEvents}
    >
      <ReaderTopBar
        {seriesHref}
        {platform}
        seriesTitle={named.seriesTitle}
        bookTitle={named.title}
        {pageNumber}
        {pageCount}
        quickSettings={isStrip ? undefined : quickSettings}
        {more}
        {isSettingsOpen}
        {areShortcutsOpen}
        bookmark={bookmarks === null
          ? null
          : {
              label:
                spread.length > 1
                  ? m.reader_bookmark_pages()
                  : m.reader_bookmark(),
              isPressed: isBookmarked,
            }}
        {isJumpOpen}
        onJump={() => {
          act("jump");
        }}
        onBookmark={() => {
          void toggleBookmark();
        }}
        onShortcuts={() => {
          act("shortcuts");
        }}
        onSettings={() => {
          openSettings(!isSettingsOpen);
        }}
        onFullScreen={() => {
          act("fullScreen");
        }}
      />
    </header>
    {#if autoScroll !== "off" && !controls.isShown}
      <div
        class="absolute inset-x-reader-bar-inline inset-be-reader-bar-bottom expanded:inset-x-lg expanded:inset-be-lg expanded:mx-auto expanded:max-inline-reader-auto-bar"
      >
        <AutoScrollBar
          speed={scrollSpeed}
          isPaused={autoScroll === "paused"}
          isTouch={!isPointer(platform)}
          onToggle={toggleAutoScroll}
          onSlower={() => {
            settings.change("pagesPerMinute", slowerSpeed(look.pagesPerMinute));
          }}
          onFaster={() => {
            settings.change("pagesPerMinute", fasterSpeed(look.pagesPerMinute));
          }}
        />
      </div>
    {/if}
    <div
      class={[
        "absolute inset-x-reader-bar-inline inset-be-reader-bar-bottom transition-all expanded:inset-x-lg expanded:inset-be-lg expanded:mx-auto expanded:max-inline-reader-dock motion-reader:duration-fade motion-reader:ease-out",
        isPanelOpen && "expanded:inset-e-reader-settings-room",
        !controls.isShown && "pointer-events-none opacity-0",
      ]}
      {...controlEvents}
      {@attach makesToastRoom}
    >
      <ReaderPanel
        pages={book.pages}
        shown={turner.shown}
        {spread}
        previous={named.previous}
        next={named.next}
        direction={reading.direction}
        quickSettings={isStrip ? undefined : quickSettings}
        isBlank={screenshotMode.isOn && screenshotMode.options.blankReaderPages}
        showsPreviews={smartFeatures.showsPagePreviews}
        isShown={controls.isShown}
        onPlay={isStrip ? startAutoScroll : undefined}
        secondsLeft={book.secondsPerPage === null ||
        !smartFeatures.showsTimeLeft
          ? undefined
          : (pageCount - turner.shown) * book.secondsPerPage}
        onSeek={(index: number) => {
          turner.goTo(index);
        }}
      />
    </div>
    {#if !controls.isShown && autoScroll === "off"}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-none inset-be-reader-bar-bottom flex justify-center"
      >
        <span
          class="rounded-full bg-reader-glass px-sm py-2xs text-caption font-semibold text-reader-muted tabular-nums"
          >{spreadPosition(spread, pageCount)}</span
        >
      </div>
    {/if}
  {/if}
  {#if zoom > 1 || isZoomedIn(viewportScale)}
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-none inset-bs-reader-zoom-badge flex justify-center"
    >
      <span
        class="rounded-shadcn-control bg-chip px-md py-2xs text-caption font-medium text-foreground tabular-nums"
      >
        {isPointer(platform)
          ? m.reader_zoom_key_to_fit({
              percent: percent.format(zoom),
              key: usesCommandKey(platform)
                ? m.reader_key_command_mac({ key: "0" })
                : m.reader_key_command({ key: "0" }),
            })
          : m.reader_zoom_tap_to_fit({
              percent: percent.format(Math.max(zoom, viewportScale)),
            })}
      </span>
    </div>
  {/if}
  <JumpToBook
    isOpen={isJumpOpen}
    {book}
    seriesTitle={named.seriesTitle}
    currentPage={turner.shown + 1}
    onClose={() => {
      openJump(false);
    }}
  />
  <KeyboardShortcuts
    isOpen={areShortcutsOpen}
    {platform}
    onClose={() => {
      areShortcutsOpen = false;
      holdControls(false);
    }}
  />
  {#if reading.isStripDetected && !isStripFoundSeen && !turner.isPastEnd}
    <StripFoundCard
      onChange={() => {
        seeStripFound();
        openSettings(true);
        void tick().then(() => {
          document
            .querySelector<HTMLSelectElement>("select[data-reading-mode]")
            ?.focus();
        });
      }}
      onDone={seeStripFound}
    />
  {:else if !isGuideSeen && !turner.isPastEnd}
    <ReaderGuide
      {isStrip}
      direction={reading.direction}
      zones={look.tapZones}
      isTouch={!isPointer(platform)}
      onDone={() => {
        seenOnce(guideKey).see();
        guidesSeenNow.add(guideKey);
      }}
    />
  {/if}
  <ReadingSettings
    isOpen={isSettingsOpen}
    {settings}
    {reading}
    seriesTitle={named.seriesTitle}
    {canUseMyPace}
    onClose={() => {
      openSettings(false);
    }}
  />
  <p role="status" class="sr-only">{announced}</p>
</main>
