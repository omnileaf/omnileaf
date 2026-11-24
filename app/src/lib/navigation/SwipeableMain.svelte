<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { on } from "svelte/events";
  import { prefersReducedMotion } from "svelte/motion";

  import {
    afterNavigate,
    beforeNavigate,
    type NavigationType,
  } from "$app/navigation";
  import { page } from "$app/state";
  import type { SwipeEdge } from "#lib/ipc/bindings.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import PageNoticeSlot from "#lib/notices/PageNoticeSlot.svelte";
  import { WindowWidth } from "#lib/page/breakpoints.ts";

  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";

  import AndroidBackLayers from "./AndroidBackLayers.svelte";
  import { AndroidBackPreview } from "./android-back-preview.svelte";
  import { getBackGoesUp } from "./back-goes-up";
  import { previewBackGestures } from "./back-preview";
  import { wayBackFrom } from "./back-link";
  import { backSwipeEdge, directionOf } from "./back-swipe";
  import { holdScrollTop } from "./hold-scroll";
  import { focusArrival } from "./page-heading";
  import { getPreviousScreens } from "./previous-screens";
  import ScreenBehindSwipe from "./ScreenBehindSwipe.svelte";
  import { SwipedScreen } from "./swiped-screen.svelte";

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

  const theme = getThemeSetting();
  const androidBack = new AndroidBackPreview({
    isDark: () => theme.resolved === "dark",
    isMotionReduced: () => prefersReducedMotion.current,
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

  let stopHoldingScroll: (() => void) | undefined;
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

  beforeNavigate(({ type }) => {
    if ((isIos || isAndroid) && swiped.element !== undefined) {
      previousScreens.keep(page.url.pathname, swiped.element);
    }
    androidBack.navigating();
    const leavingCopy = previousScreens.of(page.url.pathname);
    if (type === "popstate" && leavingCopy !== undefined) {
      androidBack.leave(leavingCopy);
    }
  });

  function isArrival(type: NavigationType): boolean {
    const isProblem = page.error !== null;
    return (type !== "enter" && !backGoesUp.isPassingThrough) || isProblem;
  }

  afterNavigate(({ type }) => {
    const landedOn = previousScreens.landedOn(page.url.pathname);
    if (isArrival(type)) {
      focusArrival({ preventScroll: landedOn !== undefined });
    }
    stopHoldingScroll?.();
    stopHoldingScroll =
      landedOn === undefined || swiped.element === undefined
        ? undefined
        : holdScrollTop(swiped.element, landedOn.scrollTop);
    swiped.arrived();
    androidBack.arrived();
    previousScreens.forgetAllButAbove(page.url.pathname);
  });

  function edgeIn(main: HTMLElement): SwipeEdge | null {
    return backSwipeEdge(wayBackFrom(main) !== undefined, directionOf(main));
  }

  $effect(() => {
    swiped.allowFor(screenShown, edgeIn);
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
        )
      : undefined;
    return () => {
      stopPreviewing?.();
      stopHoldingScroll?.();
    };
  });
</script>

{#if swiped.behind !== undefined}
  <ScreenBehindSwipe {...swiped.behind} />
{/if}
{#if isAndroid}
  <AndroidBackLayers
    preview={androidBack}
    behind={androidBack.area === undefined || swiped.element === undefined
      ? undefined
      : previousScreens.of(backPathFrom(swiped.element) ?? "")}
    cornerPx={androidBack.cornerPx}
  />
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
  <PageNoticeSlot />
  {@render children()}
</main>
