<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { on } from "svelte/events";
  import { prefersReducedMotion } from "svelte/motion";

  import {
    afterNavigate,
    beforeNavigate,
    type AfterNavigate,
    type NavigationType,
    onNavigate,
  } from "$app/navigation";
  import { navigating, page } from "$app/state";
  import type { SwipeEdge } from "#lib/ipc/bindings.ts";
  import { reportFailure } from "#lib/errors/report-failure.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import PageNoticeSlot from "#lib/notices/PageNoticeSlot.svelte";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { watchScrolled } from "#lib/page/scrolled.ts";

  import AndroidBackLayers from "./AndroidBackLayers.svelte";
  import { AndroidBackPreview } from "./android-back-preview.svelte";
  import { getBackGoesUp } from "./back-goes-up";
  import { previewBackGestures } from "./back-preview";
  import { wayBackFrom } from "./back-link";
  import { backSwipeEdge, directionOf } from "./back-swipe";
  import {
    holdScrollPlace,
    holdScrollTop,
    placeOf,
    type ScrollPlace,
  } from "./hold-scroll";
  import { isLeavingGuarded } from "./leave-guard";
  import { followOverlayBack, willOverlayTakeBack } from "./overlay-back";
  import { ScrollMemory } from "./scroll-memory";
  import { focusArrival } from "./page-heading";
  import { getPreviousScreens } from "./previous-screens";
  import ScreenBehindSwipe from "./ScreenBehindSwipe.svelte";
  import { SwipedScreen } from "./swiped-screen.svelte";
  import { entryBehind, waysBackFrom } from "./ways-back";

  const SWITCH = '[role="switch"]';

  let {
    isIos,
    isAndroid = false,
    isFullScreen = false,
    children,
  }: {
    isIos: boolean;
    isAndroid?: boolean;
    isFullScreen?: boolean;
    children: Snippet;
  } = $props();

  const androidBack = new AndroidBackPreview({
    isMotionReduced: () => prefersReducedMotion.current,
    pageBehind: () => {
      const shown = navigating.to?.url ?? page.url;
      const behind = entryBehind(shown.pathname, backGoesUp.entries);
      return behind === undefined ? undefined : previousScreens.of(behind);
    },
  });

  const language = getLanguageSetting();
  const backGoesUp = getBackGoesUp();
  const width = new WindowWidth();
  const previousScreens = getPreviousScreens();
  const swiped = new SwipedScreen({
    isOn: () => isIos,
    backPathFrom,
    goBack,
  });

  let isScrolled = $state(false);
  let stopHoldingScroll: (() => void) | undefined;
  let hasArrivedInShell = false;
  const scrollMemory = new ScrollMemory();
  const screenShown = $derived(
    `${page.url.pathname} ${language.resolved} ${width.current}`,
  );

  function backPathFrom(screen: HTMLElement): string | undefined {
    const link = wayBackFrom(screen);
    return link === undefined ? undefined : new URL(link.href).pathname;
  }

  function goBack(): boolean {
    const link =
      swiped.element === undefined ? undefined : wayBackFrom(swiped.element);
    link?.click();
    return link !== undefined;
  }

  function isOnSwitch(event: Event): boolean {
    return (
      event.target instanceof Element && event.target.closest(SWITCH) !== null
    );
  }

  function forgetCopiesOnSettingChange(screen: HTMLElement): () => void {
    const forgetCopies = () => {
      previousScreens.forgetAll();
    };
    const stopWatchingChoices = on(screen, "change", forgetCopies);
    const stopWatchingSwitches = on(screen, "click", (event) => {
      if (isOnSwitch(event)) {
        forgetCopies();
      }
    });
    return () => {
      stopWatchingChoices();
      stopWatchingSwitches();
    };
  }

  beforeNavigate(({ from, to, complete }) => {
    androidBack.navigationStarted();
    complete.catch(() => {
      androidBack.navigationStopped();
    });
    if (swiped.element === undefined) {
      return;
    }
    if (from !== null) {
      scrollMemory.leave(from.url, placeOf(swiped.element, to?.url));
    }
    if (isIos || isAndroid) {
      previousScreens.keep(page.url.pathname, swiped.element);
    }
  });

  onNavigate(({ type, from }) => {
    androidBack.navigationGoesAhead(
      type === "popstate" && from !== null
        ? previousScreens.of(from.url.pathname)
        : undefined,
    );
  });

  function isArrival(type: NavigationType): boolean {
    const isProblem = page.error !== null;
    return (type !== "enter" && !backGoesUp.isPassingThrough) || isProblem;
  }

  function isNewScreen({ from, to }: AfterNavigate): boolean {
    return from?.url.pathname !== to?.url.pathname;
  }

  function placeScroll(
    navigation: AfterNavigate,
    landedOn: number | undefined,
    restored: ScrollPlace | undefined,
  ): void {
    stopHoldingScroll?.();
    stopHoldingScroll = undefined;
    const main = swiped.element;
    if (main === undefined) {
      return;
    }
    if (landedOn !== undefined) {
      stopHoldingScroll = holdScrollTop(main, landedOn);
    } else if (restored !== undefined) {
      stopHoldingScroll = holdScrollPlace(main, restored);
    } else if (isNewScreen(navigation)) {
      main.scrollTop = 0;
    }
  }

  function forgetScreensNoWayBackReaches(): void {
    previousScreens.forgetAllBut(
      waysBackFrom({
        pathname: page.url.pathname,
        entries: backGoesUp.entries,
        backPath:
          swiped.element === undefined
            ? undefined
            : backPathFrom(swiped.element),
      }),
    );
  }

  afterNavigate((navigation) => {
    const { type, to } = navigation;
    const landedOn = previousScreens.landedOn(page.url.pathname)?.scrollTop;
    const restored =
      to === null ? undefined : scrollMemory.placeToRestore(type, to.url);
    if (isArrival(type)) {
      focusArrival({
        preventScroll: landedOn !== undefined || restored !== undefined,
      });
    }
    placeScroll(navigation, landedOn, restored);
    swiped.arrived();
    androidBack.navigationArrived();
    if (hasArrivedInShell) {
      forgetScreensNoWayBackReaches();
    } else {
      previousScreens.forgetAll();
    }
    hasArrivedInShell = true;
  });

  function edgeIn(main: HTMLElement): SwipeEdge | null {
    return backSwipeEdge(wayBackFrom(main) !== undefined, directionOf(main));
  }

  $effect(() => {
    swiped.allowFor(screenShown, edgeIn);
  });

  $effect(() => {
    const main = swiped.element;
    if (!isAndroid || main === undefined) {
      return;
    }
    return watchScrolled(main, (scrolled) => {
      isScrolled = scrolled;
    });
  });

  onMount(() => {
    const stopPreviewing = isAndroid
      ? previewBackGestures(
          (step) => {
            if (swiped.element !== undefined) {
              androidBack.follow(step, swiped.element);
            }
          },
          () =>
            location.pathname === page.url.pathname &&
            location.search === page.url.search,
          {
            isTaking: () => willOverlayTakeBack() || isLeavingGuarded(),
            follow: followOverlayBack,
          },
        )
      : undefined;
    const stopListening = listenForLibraryChanges(() => {
      previousScreens.forgetAll();
    }, reportFailure);
    return () => {
      stopPreviewing?.();
      stopHoldingScroll?.();
      stopListening();
    };
  });
</script>

{#if swiped.behind !== undefined}
  <ScreenBehindSwipe {...swiped.behind} />
{/if}
{#if isAndroid}
  <AndroidBackLayers preview={androidBack} />
{/if}
<main
  bind:this={swiped.element}
  {@attach forgetCopiesOnSettingChange}
  style:transform={androidBack.mainTransform ?? swiped.transform}
  style:border-radius={androidBack.mainTransform === undefined
    ? undefined
    : `${String(androidBack.cornerPx)}px`}
  style:transition={androidBack.mainTransition}
  class={[
    "order-2 flex flex-1 flex-col overflow-y-auto has-data-macos-inspector:me-native-inspector desktop-shell:has-data-page-toolbar:scroll-pbs-toolbar",
    !isFullScreen &&
      "px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance",
    "windows:desktop-shell:rounded-ss-windows-layer windows:desktop-shell:border-s windows:desktop-shell:border-bs windows:desktop-shell:border-windows-stroke windows:desktop-shell:bg-background",
    swiped.look,
    androidBack.mainTransform !== undefined && "bg-background",
  ]}
>
  {#if isAndroid && !isFullScreen}
    <div
      aria-hidden="true"
      data-status-bar-surface
      class={[
        "sticky -inset-bs-page-top z-series-bar -ms-gutter -me-page-end -mbs-page-top mbe-title-gap shrink-0 block-safe-top motion-safe:transition-colors motion-safe:duration-fade max-medium:-ms-page-start",
        isScrolled ? "bg-background" : "bg-transparent",
        "over-hero:bg-transparent",
      ]}
    ></div>
  {/if}
  <PageNoticeSlot />
  {@render children()}
</main>
