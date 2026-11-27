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
  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import { cn } from "#lib/components/cn.ts";
  import { reportFailure } from "#lib/errors/report-failure.ts";
  import {
    commands,
    type KeyPress,
    type OpenedBook,
    type Platform,
    type SeriesNeighbour,
    type SwipeEdge,
  } from "#lib/ipc/bindings.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import ReaderBackSwipe, {
    type ReaderBackSwipeState,
  } from "#lib/navigation/ReaderBackSwipe.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import { isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { libraryBookFileShower } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { saysWhereABookOpened } from "#lib/reader/opening-notice.ts";
  import { getSmartFeatures } from "#lib/reader/smart-features.svelte.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { standInOpenedBook } from "#lib/series/series-stand-ins.ts";
  import { shortcut } from "#lib/shortcut.ts";

  import DirectionMenu from "#lib/reader/DirectionMenu.svelte";
  import OpenedOutsideLibrary from "#lib/reader/OpenedOutsideLibrary.svelte";
  import { PageTurner } from "#lib/reader/page-turner.svelte.ts";
  import PageLoading from "#lib/reader/PageLoading.svelte";
  import type { EdgePage, EdgeView } from "#lib/reader/page-cells.ts";
  import PageStack from "#lib/reader/PageStack.svelte";
  import {
    type CroppedPages,
    croppedPages,
    pageCrop,
    type SpreadPlace,
    type StripPlace,
    suitsMode,
  } from "#lib/reader/cropped-pages.ts";
  import AutoScrollBar from "#lib/reader/AutoScrollBar.svelte";
  import AutoScrollSpeedSheet from "#lib/reader/AutoScrollSpeedSheet.svelte";
  import {
    autoScrollSpeed,
    fasterSpeed,
    pixelsScrolled,
    slowerSpeed,
  } from "#lib/reader/auto-scroll.ts";
  import StripFoundCard from "#lib/reader/StripFoundCard.svelte";
  import StripScrubber from "#lib/reader/StripScrubber.svelte";
  import StripStack from "#lib/reader/StripStack.svelte";
  import {
    type ReaderAction,
    readerShortcuts,
  } from "#lib/reader/reader-keys.ts";
  import { ReaderControls } from "#lib/reader/reader-controls.svelte.ts";
  import { librarySeriesKey } from "#lib/reader/opened-book.ts";
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
  import type {
    DoubleTapWindow,
    TapPoint,
  } from "#lib/reader/double-tap-window.ts";
  import ReaderGuide from "#lib/reader/ReaderGuide.svelte";
  import { readerHints } from "#lib/reader/reader-hints.svelte.ts";
  import ReadingSettings from "#lib/reader/ReadingSettings.svelte";
  import { seenOnce } from "#lib/reader/seen-once.ts";
  import { tapZonesFor } from "#lib/reader/tap-zones.ts";
  import ReaderPanel from "#lib/reader/ReaderPanel.svelte";
  import ReaderTopBar from "#lib/reader/ReaderTopBar.svelte";
  import { READER_CAPSULE } from "#lib/reader/reader-bar.ts";
  import {
    ReaderChrome,
    setReaderChrome,
  } from "#lib/reader/reader-chrome.svelte.ts";
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
  import { followVolumeKeys, hasVolumeKeys } from "#lib/reader/volume-keys.ts";
  import {
    forgetPagedInto,
    moveWithinReader,
  } from "#lib/reader/reader-origin.ts";
  import type { ReaderWayBack } from "#lib/reader/reader-way-back.ts";
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
  const PREVIOUS_BOOK_AT = -1;
  const UP_NEXT_CONTROLS =
    "a[href], button, input, label, select, textarea, [role='switch']";
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
    isPagedInto,
    wayBack,
    tapWindow,
    leaveReader,
  }: {
    book: OpenedBook;
    platform: Platform;
    opensAtEnd: boolean;
    hasJumped: boolean;
    isPagedInto: boolean;
    wayBack: ReaderWayBack;
    tapWindow: DoubleTapWindow;
    leaveReader: () => Promise<void>;
  } = $props();

  const screenshotMode = getScreenshotMode();
  const smartFeatures = getSmartFeatures();
  const animations = getAnimationsSetting();
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
  let dragFrom = 0;
  let isSettling = $state(false);
  let leaving: "previous" | "next" | undefined = $state();
  let hasLeft = false;
  let hasShownUpNext = $state(false);
  let isHoldFromAnotherBook = untrack(() => isPagedInto);
  const controls = new ReaderControls(CONTROLS_HIDE_AFTER_MS);
  let hasOpened = false;
  const skipUpNext = getSkipUpNextSetting();
  const notices = getNotices();
  const chrome = untrack(() => new ReaderChrome(platform));
  setReaderChrome(chrome);
  const seriesKey = untrack(() => librarySeriesKey(book));
  const reading = untrack(() =>
    seriesReadingDirection(
      seriesKey,
      book.readingDirection,
      smartFeatures.choosesReadingMode ? pagesLookLikeStrip(book.pages) : false,
    ),
  );
  const settings = untrack(() => readerSettings(seriesKey));
  const guidesSeenNow = new SvelteSet<string>();
  const guideKey = $derived(
    reading.mode === "longStrip"
      ? STRIP_GUIDE_KEY
      : settings.look.tapZones === "edges"
        ? `omnileaf.readerGuide.${reading.direction}`
        : `omnileaf.readerGuide.zones.${settings.look.tapZones}`,
  );
  const hints = readerHints();
  const isGuideDue = $derived(
    hints.isGuideDue(guidesSeenNow.has(guideKey) || seenOnce(guideKey).isSeen),
  );
  const look = $derived(settings.look);
  const isStrip = $derived(reading.mode === "longStrip");
  let stripProgress = $state(0);
  const crop = $derived(pageCrop(look.cropsBorders, isStrip));
  let cropped: CroppedPages | undefined = $state.raw(
    untrack(() =>
      crop === "whole" ? { pages: book.pages, crop: "whole" } : undefined,
    ),
  );

  const isStripShown = $derived(
    cropped === undefined || suitsMode(cropped.crop, isStrip)
      ? isStrip
      : !isStrip,
  );

  let startAt: StripPlace | SpreadPlace | undefined = $state.raw();

  function show(next: CroppedPages): void {
    if (next.crop !== cropped?.crop) {
      startAt = (isStripShown ? strip : paged)?.place();
    }
    cropped = next;
  }

  function showWholePages(pages: CroppedPages["pages"]): void {
    if (cropped?.crop !== "whole" || cropped.pages !== pages) {
      show({ pages, crop: "whole" });
    }
  }

  $effect(() => {
    const asked = crop;
    const { pages } = book;
    if (asked === "whole") {
      untrack(() => {
        showWholePages(pages);
      });
      return;
    }
    let isAsked = true;
    void croppedPages(pages, asked).then((answer) => {
      if (isAsked) {
        show(answer);
      }
    });
    return () => {
      isAsked = false;
    };
  });
  const stripFound = untrack(() =>
    seenOnce(`omnileaf.stripFound.${seriesKey}`),
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
        shownScreenHeight: () => number;
        place: () => StripPlace | undefined;
        scrubTo: (along: number) => void;
      }
    | undefined = $state();
  let paged:
    | {
        place: () => SpreadPlace | undefined;
        shiftInFlight: () => number;
        holdPoint: (point: { x: number; y: number }) => void;
      }
    | undefined = $state();
  let autoScroll: "off" | "running" | "paused" = $state("off");
  let autoScrollBar: { focusReadout: () => void } | undefined = $state();
  let isSpeedOpen = $state(false);
  let resumesAfterSpeed = false;
  let isSpeedTapped = false;
  let isTouchPausing = false;
  const pausesHintId = $props.id();
  const zonesPause = $derived.by(() => autoScroll === "running");
  const canUseMyPace = $derived(
    smartFeatures.autoScrollsAtMyPace && book.secondsPerPage !== null,
  );
  const scrollSpeed = $derived(
    autoScrollSpeed({
      choice: canUseMyPace ? look.autoScrollSpeed : "set",
      screensPerMinute: look.screensPerMinute,
      secondsPerPage: book.secondsPerPage,
    }),
  );
  let isSettingsOpen = $state(false);
  let areShortcutsOpen = $state(false);
  let isJumpOpen = $state(false);
  const isPanelOpen = $derived(isSettingsOpen || isJumpOpen);
  const panelRoom = $derived(
    chrome.isCommandBar
      ? "medium:inset-e-reader-settings-room"
      : "expanded:inset-e-reader-settings-room",
  );
  const coversPage = $derived(
    isPanelOpen && chrome.isCommandBar && chrome.width === "compact",
  );
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
  const isPagePanning = $derived(isZoomedIn(viewportScale) || zoom > 1);
  const backSwipe: ReaderBackSwipeState = $derived.by(() => {
    if (platform !== "ios" || !chrome.isPhoneSized) {
      return "off";
    }
    return isPagePanning ? "heldForPanning" : "ready";
  });
  const nextPageDragEdge: SwipeEdge | null = $derived.by(() => {
    if (isStrip) {
      return null;
    }
    return reading.direction === "rightToLeft" ? "left" : "right";
  });

  const pageSizes = $derived(book.pages.map((page) => page.size));
  const isTwoUp = $derived(!isStrip && look.layout === "two");
  const spreads = $derived(spreadsOf(pageSizes, isTwoUp));
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
    book.isInLibrary
      ? resolve("/(app)/series/[id]", { id: book.series })
      : resolve("/(app)"),
  );

  const nextHref = $derived(
    book.next === null
      ? undefined
      : resolve("/read/[book]", { book: book.next.id }),
  );
  const previousHref = $derived(
    book.previous === null
      ? undefined
      : resolve("/read/[book]", { book: book.previous.id }),
  );
  const skipsUpNext = $derived(
    skipUpNext.isOn && nextHref !== undefined && !hasShownUpNext,
  );
  const upNextAt = $derived(spreads.length);
  const nextBookAt = $derived(
    skipsUpNext ? spreads.length : spreads.length + 1,
  );
  const stripAt = $derived.by(() => {
    switch (leaving) {
      case "previous":
        return PREVIOUS_BOOK_AT;
      case "next":
        return nextBookAt;
      case undefined:
        return turner.isPastEnd ? upNextAt : spreadIndex;
    }
  });
  const isOffPages = $derived(turner.isPastEnd || leaving !== undefined);
  const previousOpensOn = $derived(book.previous?.pageCount ?? undefined);
  const nextOpensOn = $derived(
    book.next === null ? undefined : pageOpenedOn(book.next),
  );
  const previousLoading = $derived(
    loadingLabel(previousOpensOn, named.previous),
  );
  const nextLoading = $derived(loadingLabel(nextOpensOn, named.next));
  const leavingLabel = $derived.by(() => {
    switch (leaving) {
      case "previous":
        return previousLoading;
      case "next":
        return nextLoading;
      case undefined:
        return undefined;
    }
  });
  const headingTitle = $derived(
    leaving === undefined
      ? named.title
      : (named[leaving]?.title ?? named.title),
  );
  const isUpNextCurrent = $derived(
    turner.isPastEnd && leaving === undefined && !isStripShown,
  );
  const restingCount = $derived.by(() => {
    switch (leaving) {
      case "previous":
        return countOn(previousOpensOn, book.previous);
      case "next":
        return countOn(nextOpensOn, book.next);
      case undefined:
        return turner.isPastEnd ? undefined : spreadPosition(spread, pageCount);
    }
  });
  const edges: EdgePage[] = $derived([
    ...(previousHref === undefined
      ? []
      : [{ at: PREVIOUS_BOOK_AT, page: previousBookLoading }]),
    ...(skipsUpNext ? [] : [{ at: upNextAt, page: upNextPage }]),
    ...(nextHref === undefined
      ? []
      : [{ at: nextBookAt, page: nextBookLoading }]),
  ]);

  function pageOpenedOn(neighbour: SeriesNeighbour): number | undefined {
    const { reading } = neighbour;
    switch (reading.state) {
      case "notStarted":
        return 1;
      case "started":
        return reading.page ?? undefined;
      case "read":
        return undefined;
    }
  }

  function loadingLabel(
    page: number | undefined,
    neighbour: SeriesNeighbour | null,
  ): string {
    return page === undefined
      ? (neighbour?.title ?? "")
      : m.reader_page_loading({ page });
  }

  function countOn(
    page: number | undefined,
    neighbour: SeriesNeighbour | null,
  ): string | undefined {
    const count = neighbour?.pageCount ?? null;
    return page === undefined || count === null
      ? undefined
      : m.reader_position({ page, count });
  }
  let announced = $state(
    untrack(() => (saysWhereABookOpened(platform) ? pageLine : "")),
  );

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
      if (!book.isInLibrary) {
        return;
      }
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

  function openShortcuts(isOpen: boolean): void {
    areShortcutsOpen = isOpen;
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
    const line = leavingLabel ?? pageLine;
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

  function pauseIfRunning(): boolean {
    const wasRunning = autoScroll === "running";
    if (wasRunning) {
      autoScroll = "paused";
    }
    return wasRunning;
  }

  function openSpeed(event: MouseEvent): void {
    resumesAfterSpeed = pauseIfRunning();
    isSpeedTapped = isPointerClick(event);
    isSpeedOpen = true;
  }

  function closeSpeed(): void {
    isSpeedOpen = false;
    if (resumesAfterSpeed && autoScroll === "paused") {
      autoScroll = "running";
    }
    resumesAfterSpeed = false;
  }

  function returnFocusFromSpeed(): void {
    if (isSpeedTapped) {
      heading?.focus();
      return;
    }
    autoScrollBar?.focusReadout();
  }

  function stopAutoScroll(): void {
    autoScroll = "off";
    heading?.focus();
  }

  $effect(() => {
    if (!isStrip) {
      autoScroll = "off";
    }
  });

  function reachStripEnd(): void {
    if (look.pausesAtEnd) {
      autoScroll = "paused";
      return;
    }
    autoScroll = "off";
    act("next");
  }

  function pauseOnTouch(): void {
    isTouchPausing = pauseIfRunning();
  }

  function onStripZone(event: MouseEvent, zone: ReaderAction): void {
    const isTouchThatPaused = isTouchPausing && isPointerClick(event);
    isTouchPausing = false;
    if (isTouchThatPaused) {
      return;
    }
    if (autoScroll === "running") {
      autoScroll = "paused";
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
      const pixels = pixelsScrolled(elapsed, scrollSpeed, {
        page: strip?.shownPageHeight() ?? 0,
        screen: strip?.shownScreenHeight() ?? 0,
      });
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

  function act(action: ReaderAction, press: KeyPress = "pressed"): void {
    if (press === "pressed") {
      isHoldFromAnotherBook = false;
    }
    switch (action) {
      case "toggleAutoScroll":
        toggleAutoScroll();
        return;
      case "next":
        turnUnlessHeldPast(1, press);
        return;
      case "previous":
        turnUnlessHeldPast(-1, press);
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
        void leaveReader();
        return;
      case "jump":
        openJump(!isJumpOpen);
        return;
      case "shortcuts":
        openShortcuts(!areShortcutsOpen);
        return;
      case "leave":
        if (!closeOpenPanel()) {
          void leaveFullScreenOrBook();
        }
        return;
    }
  }

  function closeOpenPanel(): boolean {
    if (isJumpOpen) {
      openJump(false);
    } else if (isSettingsOpen) {
      openSettings(false);
    } else if (areShortcutsOpen) {
      openShortcuts(false);
    } else {
      return false;
    }
    return true;
  }

  $effect(() => {
    if (!isPanelOpen && !areShortcutsOpen) {
      return;
    }
    return takeBackWithinScreen(closeOpenPanel);
  });

  function turnUnlessHeldPast(step: number, press: KeyPress): void {
    const isHeldPastTheBook =
      isHoldFromAnotherBook ||
      leaving !== undefined ||
      (step > 0 && turner.isPastEnd) ||
      (step < 0 && isOnFirstSpread());
    if (press === "held" && isHeldPastTheBook) {
      return;
    }
    turnBy(step);
  }

  function isOnFirstSpread(): boolean {
    return !isStrip && !turner.isPastEnd && spreadIndex === 0;
  }

  function turnBy(step: number): void {
    dropWaitingTap();
    if (isStrip && !turner.isPastEnd) {
      scrollBy(step);
      return;
    }
    if (leaving !== undefined) {
      turnWhileLeaving(step);
      return;
    }
    if (step > 0 && turner.isPastEnd) {
      if (isStrip || nextHref === undefined) {
        startNextBook();
      } else {
        leaveFor("next");
      }
      return;
    }
    const target = spreads[spreadIndex + step];
    if (target === undefined && !turner.isPastEnd && !isStrip) {
      if (step < 0 && previousHref !== undefined) {
        leaveFor("previous");
        return;
      }
      if (step > 0 && skipsUpNext) {
        leaveFor("next");
        return;
      }
    }
    const from = { shown: turner.shown, isPastEnd: turner.isPastEnd };
    if (turner.isPastEnd) {
      turner.turn(step);
    } else if (target !== undefined) {
      turner.goTo(target[0] ?? turner.shown);
    } else if (step > 0) {
      turner.goTo(pageCount - 1);
      turner.turn(1);
    }
    zoom = 1;
    if (turner.shown !== from.shown || turner.isPastEnd !== from.isPastEnd) {
      isSettling = slidesPages();
    }
    controls.hide();
    hasShownUpNext ||= turner.isPastEnd;
  }

  function leaveFor(way: "previous" | "next"): void {
    leaving = way;
    zoom = 1;
    controls.hide();
    isSettling = slidesPages();
    if (!isSettling) {
      openBookLeftFor();
    }
  }

  function turnWhileLeaving(step: number): void {
    const isTurnBack = leaving === "next" ? step < 0 : step > 0;
    if (hasLeft || !isTurnBack) {
      return;
    }
    leaving = undefined;
    isSettling = slidesPages();
  }

  function openBookLeftFor(): void {
    if (hasLeft || leaving === undefined) {
      return;
    }
    hasLeft = true;
    if (leaving === "previous") {
      if (previousHref !== undefined) {
        void moveWithinReader(previousHref, {
          readerOpensAtEnd: true,
          readerPagedInto: true,
        });
      }
      return;
    }
    if (turner.isPastEnd) {
      startNextBook();
    } else {
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
    void (nextHref === undefined
      ? goto(seriesHref).catch(reportFailure)
      : moveWithinReader(nextHref, { readerPagedInto: true }));
  }

  function goStraightOn(): void {
    if (named.next === null) {
      return;
    }
    const finished = resolve("/read/[book]", { book: book.id });
    startNextBook();
    if (chrome.isOnPhone) {
      return;
    }
    notices.offerUndo({
      title: m.reader_now_reading({ title: named.next.title }),
      undo: () => {
        void moveWithinReader(finished, { readerOpensAtEnd: true });
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
    if ((await keepBookmarks(bookmarks, pages, isOn)) && !chrome.isOnPhone) {
      notices.offerUndo({
        title: pagesWord(pages, isOn),
        undo: () => {
          void keepBookmarks(bookmarks, pages, !isOn);
        },
      });
    }
  }

  function zoomTo(scale: number): void {
    dropWaitingTap();
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
    jumpTo(index);
    zoom = 1;
    controls.hide();
  }

  function jumpTo(index: number): void {
    if (hasLeft) {
      return;
    }
    dropWaitingTap();
    isSettling = false;
    leaving = undefined;
    turner.goTo(index);
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
    if (opensAtEnd || !saysWhereABookOpened(platform)) {
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
    if (!hints.showsResumeNotice(chrome.isOnPhone)) {
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
    const noticed = seenOnce(`omnileaf.directionFound.${seriesKey}`);
    if (
      chrome.isOnPhone ||
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
    await leaveReader();
  }

  function isAtRevealEdge(event: PointerEvent): boolean {
    return (
      event.pointerType === "mouse" &&
      (event.clientY < REVEAL_EDGE_PX ||
        event.clientY > window.innerHeight - REVEAL_EDGE_PX)
    );
  }

  let lastPointer = { x: Number.NaN, y: Number.NaN };
  let waitingTap: ReturnType<typeof setTimeout> | undefined;
  let tappedWith = "";
  let isSecondTap = false;
  let isUntouchedSincePagedInto = untrack(() => isPagedInto);
  let isSecondTapOfTheTurnIn = false;

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
    if (
      !swipe.isClickASwipe() &&
      !isSecondTapOfTheTurnIn &&
      action !== undefined
    ) {
      act(action);
    }
  }

  function onMiddleTap(event: MouseEvent): void {
    if (!isPointerClick(event) || tappedWith === "mouse") {
      onZone(event, "toggleControls");
      return;
    }
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    dropWaitingTap();
    const isZoomTap = isSecondTap;
    isSecondTap = false;
    if (swipe.isClickASwipe()) {
      return;
    }
    if (isZoomTap) {
      zoomOnDoubleTap(event);
      return;
    }
    waitingTap = setTimeout(() => {
      waitingTap = undefined;
      act("toggleControls");
    }, tapWindow.leftAfter(performance.now()));
  }

  function dropWaitingTap(): void {
    clearTimeout(waitingTap);
    waitingTap = undefined;
  }

  function zoomOnDoubleTap(event: MouseEvent): void {
    if (isOffPages) {
      return;
    }
    if (isZoomedIn(viewportScale)) {
      fitPinch();
      return;
    }
    if (zoom > 1) {
      zoomTo(1);
      return;
    }
    paged?.holdPoint({ x: event.clientX, y: event.clientY });
    zoomTo(ZOOM_DOUBLE);
  }

  function isPointerClick(event: MouseEvent): boolean {
    return event.detail > 0;
  }

  function isOnUpNextControl(event: MouseEvent): boolean {
    return (
      event.target instanceof Element &&
      event.target.closest(UP_NEXT_CONTROLS) !== null
    );
  }

  function zoneUnder(event: MouseEvent): HTMLButtonElement | undefined {
    return document
      .elementsFromPoint(event.clientX, event.clientY)
      .find(
        (element): element is HTMLButtonElement =>
          element instanceof HTMLButtonElement &&
          element.parentElement?.hasAttribute("data-tap-zones") === true,
      );
  }

  const passesTapsToZones: Attachment<HTMLElement> = (element) =>
    on(element, "click", (event: MouseEvent) => {
      if (isPointerClick(event) && !isOnUpNextControl(event)) {
        zoneUnder(event)?.dispatchEvent(new MouseEvent("click", event));
      }
    });

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

  function slidesPages(): boolean {
    return look.pageTurn === "slide" && animations.moves("reader");
  }

  function onSwipeStart(event: PointerEvent): void {
    swipe.started(event);
    tappedWith = event.pointerType;
    dragFrom = 0;
    const press = tapPointOf(event);
    isSecondTapOfTheTurnIn =
      isUntouchedSincePagedInto && tapWindow.isSecondTap(press);
    isUntouchedSincePagedInto = false;
    isSecondTap =
      waitingTap !== undefined && !isOffPages && tapWindow.isSecondTap(press);
    if (isSecondTap) {
      dropWaitingTap();
    }
  }

  function tapPointOf(event: PointerEvent): TapPoint {
    return { at: performance.now(), x: event.clientX, y: event.clientY };
  }

  function onSwipeMove(event: PointerEvent): void {
    const across = swipe.moved(event);
    if (across === undefined || hasLeft) {
      return;
    }
    dropWaitingTap();
    if (look.pageTurn !== "slide" || isPagePanning) {
      return;
    }
    if (isSettling) {
      dragFrom = paged?.shiftInFlight() ?? 0;
      isSettling = false;
    }
    slide = dragFrom + across;
  }

  function onSwipeEnd(event: PointerEvent): void {
    tapWindow.lifted(tapPointOf(event));
    const turn = swipe.ended(event);
    if (turn !== undefined && !isPagePanning) {
      turnBy(TURN_STEPS[inReadingOrder(turn, reading.direction)]);
    }
    settleSlide();
  }

  function swallowClickOfASwipe(event: MouseEvent): void {
    if (swipe.isClickASwipe()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  const swipeEvents = {
    onclickcapture: swallowClickOfASwipe,
    onpointerdown: onSwipeStart,
    onpointermove: onSwipeMove,
    onpointerup: onSwipeEnd,
    onpointercancel: () => {
      swipe.cancelled();
      settleSlide();
    },
  };

  function settleSlide(): void {
    isSettling ||= slide !== 0 && animations.moves("reader");
    slide = 0;
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

  const turnsPagesWithVolumeKeys = $derived(
    look.turnsPagesWithVolumeKeys && hasVolumeKeys(platform),
  );

  $effect(() =>
    turnsPagesWithVolumeKeys
      ? followVolumeKeys(({ turn, press }) => {
          act(turn, press);
        }, reportFailure)
      : undefined,
  );

  let wasUpNextCurrent = false;

  $effect(() => {
    const isCurrent = isUpNextCurrent;
    untrack(() => {
      if (wasUpNextCurrent && !isCurrent && isFocusLeftBehind()) {
        heading?.focus({ preventScroll: true });
      }
      wasUpNextCurrent = isCurrent;
    });
  });

  function isFocusLeftBehind(): boolean {
    const focused = document.activeElement;
    return (
      focused === null ||
      focused === document.body ||
      focused.closest("[data-up-next]") !== null
    );
  }

  onMount(() => {
    if (isGuideDue || isPagedInto) {
      controls.hide();
    }
    sayWhereItOpened();
    sayDirectionFound();
  });

  onMount(() => {
    heading?.focus();
    return () => {
      controls.stop();
      dropWaitingTap();
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
    seriesTitle={named.seriesTitle}
    {pageNumber}
    {pageCount}
    {platform}
    onMarkRead={() => {
      void markRead();
    }}
    onStartOver={() => {
      jumpTo(0);
    }}
    onShowFile={libraryBookFileShower(book, notices)}
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
    <span id={pausesHintId} hidden>{m.reader_auto_scroll_zone_pauses()}</span>
    {#if look.tapToScroll === "topAndBottom"}
      <button
        type="button"
        aria-label={m.reader_scroll_up()}
        aria-describedby={zonesPause ? pausesHintId : undefined}
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
      aria-describedby={zonesPause ? pausesHintId : undefined}
      class="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-reader-accent"
      onclick={(event) => {
        onStripZone(event, "toggleControls");
      }}
    ></button>
    {#if look.tapToScroll === "topAndBottom"}
      <button
        type="button"
        aria-label={m.reader_scroll_down()}
        aria-describedby={zonesPause ? pausesHintId : undefined}
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
      isPagePanning ? "touch-manipulation" : "touch-pan-y touch-pinch-zoom",
    ]}
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
          onclick={onMiddleTap}
          ondblclick={(event) => {
            if (tappedWith === "mouse") {
              zoomOnDoubleTap(event);
            }
          }}
        ></button>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet light()}
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
{/snippet}

{#snippet upNext(isShown: boolean)}
  <div {@attach passesTapsToZones} class="contents">
    <UpNext
      book={book.id}
      title={named.title}
      seriesTitle={named.seriesTitle}
      {seriesHref}
      backHref={wayBack.href}
      backLabel={wayBack.label}
      onBack={() => {
        void leaveReader();
      }}
      next={named.next}
      {nextHref}
      direction={reading.direction}
      {isShown}
    />
  </div>
{/snippet}

{#snippet upNextPage({ isCurrent }: EdgeView)}
  {@render upNext(isCurrent)}
{/snippet}

{#snippet bookLoading(view: EdgeView, label: string)}
  <div
    data-book-loading
    aria-hidden="true"
    class="flex flex-col items-center justify-center gap-sm px-xl text-center block-full inline-full"
  >
    {#if view.isOnScreen}
      <PageLoading {label} />
    {/if}
  </div>
{/snippet}

{#snippet previousBookLoading(view: EdgeView)}
  {@render bookLoading(view, previousLoading)}
{/snippet}

{#snippet nextBookLoading(view: EdgeView)}
  {@render bookLoading(view, nextLoading)}
{/snippet}

<ReaderBackSwipe
  swipeState={backSwipe}
  takenEdge={nextPageDragEdge}
  backPath={wayBack.path}
  onBack={leaveReader}
>
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
    {#if !book.isInLibrary}
      <OpenedOutsideLibrary {platform} />
    {/if}
    <div
      inert={coversPage}
      class={["absolute inset-none", isPanelOpen && panelRoom]}
      {...isStripShown ? {} : swipeEvents}
    >
      {#if cropped !== undefined}
        {#key cropped.crop}
          {#if isStripShown}
            <StripStack
              bind:this={strip}
              pages={cropped.pages}
              crop={cropped.crop}
              shown={turner.shown}
              isBlank={screenshotMode.isOn &&
                screenshotMode.options.blankReaderPages}
              marks={bookmarks === null ? [] : [...bookmarks]}
              overlay={stripZones}
              startAt={startAt?.kind === "strip" ? startAt : undefined}
              bind:progress={stripProgress}
              onShown={(index: number) => {
                turner.goTo(index);
              }}
              onShownReady={() => {
                startAt = undefined;
                if (!hasOpened) {
                  hasOpened = true;
                  controls.bookOpened();
                  forgetPagedInto();
                }
              }}
            />
          {:else}
            <PageStack
              bind:this={paged}
              pages={cropped.pages}
              crop={cropped.crop}
              shown={turner.shown}
              {spreads}
              {stripAt}
              {edges}
              showsLoadingAtOnce={isPagedInto}
              fit={look.fit}
              {zoom}
              isReversed={reading.direction === "rightToLeft"}
              overlay={turnZones}
              ground={BACKGROUNDS[look.background]}
              pageLight={look.light.isOn ? light : undefined}
              bookTitle={named.title}
              isBlank={screenshotMode.isOn &&
                screenshotMode.options.blankReaderPages}
              {slide}
              {isSettling}
              startAt={startAt?.kind === "spread" ? startAt : undefined}
              onNextPage={() => {
                act("next");
              }}
              onSettled={() => {
                isSettling = false;
                if (slide === 0) {
                  openBookLeftFor();
                }
              }}
              onShownReady={() => {
                startAt = undefined;
                if (!hasOpened) {
                  hasOpened = true;
                  controls.bookOpened();
                  forgetPagedInto();
                }
              }}
            />
          {/if}
        {/key}
      {/if}
      {#if look.light.isOn && isStripShown}
        {@render light()}
      {/if}
    </div>
    <h1 bind:this={heading} tabindex="-1" class="sr-only">{headingTitle}</h1>
    {#if isStripShown && turner.isPastEnd}
      {@render upNext(true)}
    {:else if !isOffPages}
      <header
        class={[
          "absolute transition-all motion-reader:duration-fade motion-reader:ease-out",
          chrome.isCommandBar
            ? "inset-x-none inset-bs-none"
            : [
                "expanded:inset-x-lg expanded:inset-bs-md",
                chrome.spans
                  ? "inset-x-none inset-bs-none"
                  : "inset-x-reader-bar-inline inset-bs-reader-bar-top",
              ],
          !controls.isShown &&
            "pointer-events-none opacity-0 android:-translate-y-md",
        ]}
        {...controlEvents}
      >
        <ReaderTopBar
          {seriesHref}
          backHref={wayBack.href}
          backLabel={wayBack.label}
          isBackToSeries={wayBack.isSeries}
          onBack={() => {
            void leaveReader();
          }}
          isInLibrary={book.isInLibrary}
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
          onJump={book.isInLibrary
            ? () => {
                act("jump");
              }
            : undefined}
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
        <AutoScrollBar
          bind:this={autoScrollBar}
          speed={scrollSpeed}
          chapterProgress={stripProgress}
          isPaused={autoScroll === "paused"}
          isTouch={!isPointer(platform)}
          onToggle={toggleAutoScroll}
          onSlower={() => {
            settings.changeSpeed(slowerSpeed(settings.speed));
          }}
          onFaster={() => {
            settings.changeSpeed(fasterSpeed(settings.speed));
          }}
          onStop={stopAutoScroll}
          onReturnFocus={() => {
            heading?.focus();
          }}
          onSpeed={openSpeed}
        />
      {/if}
      {#if isStripShown && chrome.spans}
        <div
          class={[
            "transition-opacity motion-reader:duration-fade motion-reader:ease-out",
            !controls.isShown && "pointer-events-none opacity-0",
          ]}
          {...controlEvents}
        >
          <StripScrubber
            progress={stripProgress}
            shown={turner.shown}
            count={pageCount}
            position={spreadPosition(spread, pageCount)}
            onScrub={(along: number) => {
              strip?.scrubTo(along);
            }}
            onSeek={(index: number) => {
              turner.goTo(index);
            }}
          />
        </div>
      {/if}
      <div
        class={[
          "absolute transition-all motion-reader:duration-fade motion-reader:ease-out",
          chrome.isCommandBar
            ? "inset-x-none inset-be-none"
            : [
                "expanded:inset-x-lg expanded:inset-be-lg expanded:mx-auto expanded:max-inline-reader-dock",
                chrome.spans
                  ? "inset-x-none inset-be-none"
                  : "inset-x-reader-bar-inline inset-be-reader-bar-bottom",
              ],
          isPanelOpen && panelRoom,
          chrome.floats && "pointer-events-none",
          !controls.isShown &&
            "pointer-events-none opacity-0 android:translate-y-md",
        ]}
        inert={coversPage}
        {...controlEvents}
        {@attach makesToastRoom}
      >
        <ReaderPanel
          pages={book.pages}
          shown={turner.shown}
          {spread}
          {spreads}
          previous={named.previous}
          next={named.next}
          direction={reading.direction}
          quickSettings={isStrip ? undefined : quickSettings}
          isBlank={screenshotMode.isOn &&
            screenshotMode.options.blankReaderPages}
          showsPreviews={smartFeatures.showsPagePreviews}
          isShown={controls.isShown}
          hidesSlider={isStripShown && chrome.spans}
          onPlay={isStrip ? startAutoScroll : undefined}
          secondsLeft={book.secondsPerPage === null ||
          !smartFeatures.showsTimeLeft
            ? undefined
            : (pageCount - turner.shown) * book.secondsPerPage}
          onSeek={(index: number) => {
            jumpTo(index);
          }}
        />
      </div>
    {/if}
    {#if restingCount !== undefined && !controls.isShown && autoScroll === "off"}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-none inset-be-reader-bar-bottom flex justify-center"
      >
        <span
          data-reader-resting-count
          class={cn(
            "rounded-full px-sm py-2xs text-caption font-semibold tabular-nums",
            chrome.floats
              ? [READER_CAPSULE, "px-md"]
              : "bg-reader-glass text-reader-muted",
          )}
        >
          {restingCount}
        </span>
      </div>
    {/if}
    {#if isPagePanning}
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
    {#if book.isInLibrary}
      <JumpToBook
        isOpen={isJumpOpen}
        {book}
        seriesTitle={named.seriesTitle}
        currentPage={turner.shown + 1}
        onClose={() => {
          openJump(false);
        }}
      />
    {/if}
    <KeyboardShortcuts
      isOpen={areShortcutsOpen}
      isInLibrary={book.isInLibrary}
      backLabel={wayBack.genericLabel}
      {platform}
      onClose={() => {
        openShortcuts(false);
      }}
    />
    {#if reading.isStripDetected && !isStripFoundSeen && !isOffPages}
      <StripFoundCard
        onChange={() => {
          seeStripFound();
          openSettings(true);
          void tick().then(() => {
            document.querySelector<HTMLElement>("[data-reading-mode]")?.focus();
          });
        }}
        onDone={seeStripFound}
      />
    {:else if isGuideDue && !isOffPages}
      <ReaderGuide
        {isStrip}
        direction={reading.direction}
        zones={look.tapZones}
        isTouch={!isPointer(platform)}
        onDone={() => {
          seenOnce(guideKey).see();
          guidesSeenNow.add(guideKey);
          hints.disarmReplay();
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
    <AutoScrollSpeedSheet
      isOpen={isSpeedOpen}
      {settings}
      seriesTitle={named.seriesTitle}
      onClose={closeSpeed}
      onReturnFocus={returnFocusFromSpeed}
    />
    <p role="status" class="sr-only">{announced}</p>
  </main>
</ReaderBackSwipe>
