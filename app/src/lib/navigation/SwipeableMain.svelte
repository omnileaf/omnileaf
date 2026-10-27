<script lang="ts">
  import { Channel } from "@tauri-apps/api/core";
  import { onMount, type Snippet } from "svelte";
  import { on } from "svelte/events";
  import { prefersReducedMotion } from "svelte/motion";

  import {
    afterNavigate,
    beforeNavigate,
    type NavigationType,
  } from "$app/navigation";
  import { page } from "$app/state";
  import { assertNever } from "#lib/assert-never.ts";
  import { type BackSwipe, commands } from "#lib/ipc/bindings.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";

  import { getBackGoesUp } from "./back-goes-up";
  import { shownBackLink } from "./back-link";
  import {
    backSwipeEdge,
    directionOf,
    isGoingBack,
    SETTLING_MOTION,
    type TextDirection,
  } from "./back-swipe";
  import { isBackTakenByScreen } from "./back-within-screen";
  import { BackSwipeScreens } from "./back-swipe-screens.svelte";
  import { focusArrival } from "./page-heading";
  import { getPreviousScreens, type ScreenCopy } from "./previous-screens";
  import ScreenBehindSwipe from "./ScreenBehindSwipe.svelte";

  interface SwipeStart {
    readonly area: DOMRect;
    readonly previousScreen: ScreenCopy | undefined;
    readonly direction: TextDirection;
  }

  const SWITCH = '[role="switch"]';

  let {
    isIos,
    isFullScreen = false,
    children,
  }: { isIos: boolean; isFullScreen?: boolean; children: Snippet } = $props();

  const language = getLanguageSetting();
  const backGoesUp = getBackGoesUp();
  const width = new WindowWidth();
  const previousScreens = getPreviousScreens();
  const screens = new BackSwipeScreens(
    goBack,
    () => prefersReducedMotion.current,
  );

  let main: HTMLElement | undefined = $state();
  let swipeStart: SwipeStart | undefined = $state();
  let allowedFor: string | undefined;
  const screenShown = $derived(
    `${page.url.pathname} ${language.resolved} ${width.current}`,
  );
  const swiping = $derived(
    screens.placement === null || swipeStart === undefined
      ? undefined
      : {
          ...swipeStart,
          ...screens.placement,
          towardsBack: swipeStart.direction === "rtl" ? -100 : 100,
        },
  );

  function goBack(): boolean {
    const link = main === undefined ? undefined : shownBackLink(main);
    link?.click();
    return link !== undefined;
  }

  function startOf(screen: HTMLElement): SwipeStart | undefined {
    const link = shownBackLink(screen);
    if (link === undefined) {
      return undefined;
    }
    return {
      area: screen.getBoundingClientRect(),
      previousScreen: previousScreens.of(new URL(link.href).pathname),
      direction: directionOf(screen),
    };
  }

  function acrossScreen(swipe: BackSwipe, screen: DOMRect): BackSwipe {
    const scale = window.innerWidth / screen.width;
    switch (swipe.kind) {
      case "moved":
        return { ...swipe, progress: (swipe.progress ?? 0) * scale };
      case "released":
        return {
          ...swipe,
          progress: (swipe.progress ?? 0) * scale,
          velocity: (swipe.velocity ?? 0) * scale,
        };
      case "cancelled":
        return swipe;
      default:
        return assertNever(swipe);
    }
  }

  function follow(swipe: BackSwipe): void {
    if (screens.placement === null && main !== undefined) {
      swipeStart = startOf(main);
    }
    if (swipeStart !== undefined) {
      screens.follow(unlessTakenByScreen(acrossScreen(swipe, swipeStart.area)));
    }
  }

  function unlessTakenByScreen(swipe: BackSwipe): BackSwipe {
    return swipe.kind === "released" &&
      isGoingBack(swipe.progress ?? 0, swipe.velocity ?? 0) &&
      isBackTakenByScreen()
      ? { kind: "cancelled" }
      : swipe;
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
    if (isIos && main !== undefined) {
      previousScreens.keep(page.url.pathname, main);
    }
  });

  function isArrival(type: NavigationType): boolean {
    const isProblem = page.error !== null;
    return (type !== "enter" && !backGoesUp.isPassingThrough) || isProblem;
  }

  afterNavigate(({ type }) => {
    const landedOn = screens.isSettling
      ? swipeStart?.previousScreen
      : undefined;
    if (isArrival(type)) {
      focusArrival({ preventScroll: landedOn !== undefined });
    }
    if (landedOn !== undefined && main !== undefined) {
      main.scrollTop = landedOn.scrollTop;
    }
    screens.arrived();
    previousScreens.forgetAllButAbove(page.url.pathname);
  });

  $effect(() => {
    if (screens.isSettling && main !== undefined) {
      void screens.settleOnceMoved(main);
    }
  });

  $effect(() => {
    if (!isIos || main === undefined || allowedFor === screenShown) {
      return;
    }
    allowedFor = screenShown;
    void commands.allowBackSwipe(
      backSwipeEdge(shownBackLink(main) !== undefined, directionOf(main)),
    );
  });

  onMount(() => {
    if (!isIos) {
      return;
    }
    void commands.watchBackSwipes(new Channel(follow));
    return () => {
      void commands.allowBackSwipe(null);
    };
  });
</script>

{#if swiping !== undefined}
  <ScreenBehindSwipe
    area={swiping.area}
    copy={swiping.previousScreen}
    offset={swiping.previous * swiping.towardsBack}
    dimming={swiping.dimming}
    isSettling={screens.isSettling}
  />
{/if}
<main
  bind:this={main}
  {@attach forgetCopiesOnSettingChange}
  style:transform={swiping === undefined
    ? undefined
    : `translateX(${String(swiping.current * swiping.towardsBack)}%)`}
  class={[
    "order-2 flex flex-1 flex-col overflow-y-auto desktop-shell:has-data-page-toolbar:scroll-pbs-toolbar",
    !isFullScreen &&
      "px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance",
    "windows:desktop-shell:rounded-ss-windows-layer windows:desktop-shell:border-s windows:desktop-shell:border-bs windows:desktop-shell:border-windows-stroke windows:desktop-shell:bg-background",
    swiping !== undefined &&
      "bg-background shadow-back-swipe rtl:shadow-back-swipe-rtl",
    screens.isSettling && ["transition-transform", SETTLING_MOTION],
  ]}
>
  {@render children()}
</main>
