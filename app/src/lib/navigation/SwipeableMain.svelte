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

  import { getBackGoesUp } from "./back-goes-up";
  import { backPreviewLook, previewBackGestures } from "./back-preview";
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

  let backProgress: number | undefined = $state();
  const backPreview = $derived(
    backProgress === undefined
      ? undefined
      : backPreviewLook(backProgress, prefersReducedMotion.current),
  );

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

  beforeNavigate(() => {
    if (isIos && swiped.element !== undefined) {
      previousScreens.keep(page.url.pathname, swiped.element);
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
    backProgress = undefined;
    previousScreens.forgetAllButAbove(page.url.pathname);
  });

  function edgeIn(main: HTMLElement): SwipeEdge | null {
    return backSwipeEdge(wayBackFrom(main) !== undefined, directionOf(main));
  }

  $effect(() => {
    swiped.allowFor(screenShown, edgeIn);
  });

  onMount(() => {
    if (isAndroid) {
      previewBackGestures((progress) => {
        backProgress = progress;
      });
    }
    return () => {
      stopHoldingScroll?.();
    };
  });
</script>

{#if swiped.behind !== undefined}
  <ScreenBehindSwipe {...swiped.behind} />
{/if}
<main
  bind:this={swiped.element}
  {@attach forgetCopiesOnSettingChange}
  style:transform={backPreview === undefined
    ? swiped.transform
    : `scale(${String(backPreview.scale)})`}
  style:border-radius={backPreview === undefined
    ? undefined
    : `${String(backPreview.cornerPx)}px`}
  class={[
    "order-2 flex flex-1 flex-col overflow-y-auto has-data-macos-inspector:me-native-inspector desktop-shell:has-data-page-toolbar:scroll-pbs-toolbar",
    !isFullScreen &&
      "px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance",
    "windows:desktop-shell:rounded-ss-windows-layer windows:desktop-shell:border-s windows:desktop-shell:border-bs windows:desktop-shell:border-windows-stroke windows:desktop-shell:bg-background",
    swiped.look,
  ]}
>
  <PageNoticeSlot />
  {@render children()}
</main>
