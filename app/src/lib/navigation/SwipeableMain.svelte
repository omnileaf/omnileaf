<script lang="ts">
  import { Channel } from "@tauri-apps/api/core";
  import { onMount, type Snippet } from "svelte";
  import { on } from "svelte/events";
  import { prefersReducedMotion } from "svelte/motion";

  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { assertNever } from "#lib/assert-never.ts";
  import { type BackSwipe, commands } from "#lib/ipc/bindings.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";

  import { shownBackLink } from "./back-link";
  import { backSwipeEdge, isGoingBack, type TextDirection } from "./back-swipe";
  import { isBackTakenByScreen } from "./back-within-screen";
  import { BackSwipeScreens } from "./back-swipe-screens.svelte";
  import { PreviousScreens, type ScreenCopy } from "./previous-screens";

  interface SwipeStart {
    readonly area: DOMRect;
    readonly previousScreen: ScreenCopy | undefined;
    readonly direction: TextDirection;
  }

  const SWITCH = '[role="switch"]';
  const SETTLING =
    "duration-slide ease-glass motion-reduce:duration-grow motion-reduce:ease-out";

  let {
    isIos,
    isFullScreen = false,
    children,
  }: { isIos: boolean; isFullScreen?: boolean; children: Snippet } = $props();

  const language = getLanguageSetting();
  const width = new WindowWidth();
  const previousScreens = new PreviousScreens();
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
  const previousScreen = $derived(swipeStart?.previousScreen);
  const swiping = $derived(
    screens.placement === null || swipeStart === undefined
      ? undefined
      : {
          ...swipeStart,
          ...screens.placement,
          towardsBack: swipeStart.direction === "rtl" ? -100 : 100,
        },
  );

  function directionOf(screen: HTMLElement): TextDirection {
    return getComputedStyle(screen).direction === "rtl" ? "rtl" : "ltr";
  }

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

  async function settleOnceMoved(screen: HTMLElement): Promise<void> {
    await Promise.allSettled(
      screen.getAnimations().map((animation) => animation.finished),
    );
    screens.settled();
  }

  function showPrevious(copy: ScreenCopy) {
    return (holder: HTMLElement) => {
      holder.append(copy.content);
      copy.content.scrollTop = copy.scrollTop;
      return () => {
        copy.content.remove();
      };
    };
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

  function restoreScrollAfterHeadingFocus(copy: ScreenCopy): void {
    requestAnimationFrame(() => {
      if (main !== undefined) {
        main.scrollTop = copy.scrollTop;
      }
    });
  }

  afterNavigate(() => {
    const landedOn = screens.isSettling
      ? swipeStart?.previousScreen
      : undefined;
    if (landedOn !== undefined) {
      restoreScrollAfterHeadingFocus(landedOn);
    }
    screens.arrived();
    previousScreens.forgetAllButAbove(page.url.pathname);
  });

  $effect(() => {
    if (screens.isSettling && main !== undefined) {
      void settleOnceMoved(main);
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

  /** Screens outside the app's navigation, such as the reader, have no way back for a swipe to take. */
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
  <div
    aria-hidden="true"
    inert
    data-previous-screen
    class="fixed overflow-hidden bg-background"
    style:left="{swiping.area.left}px"
    style:top="{swiping.area.top}px"
    style:width="{swiping.area.width}px"
    style:height="{swiping.area.height}px"
  >
    <div
      class={[
        "flex flex-col block-full inline-full",
        screens.isSettling && ["transition-transform", SETTLING],
      ]}
      style:transform="translateX({swiping.previous * swiping.towardsBack}%)"
    >
      {#if previousScreen !== undefined}
        <div class="contents" {@attach showPrevious(previousScreen)}></div>
      {/if}
    </div>
    <div
      class={[
        "absolute inset-none bg-back-swipe-dim",
        screens.isSettling && ["transition-opacity", SETTLING],
      ]}
      style:opacity={swiping.dimming}
    ></div>
  </div>
{/if}
<main
  bind:this={main}
  {@attach forgetCopiesOnSettingChange}
  style:transform={swiping === undefined
    ? undefined
    : `translateX(${String(swiping.current * swiping.towardsBack)}%)`}
  class={[
    "order-2 flex flex-1 flex-col overflow-y-auto",
    !isFullScreen &&
      "px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance",
    "windows:desktop-shell:rounded-ss-windows-layer windows:desktop-shell:border-s windows:desktop-shell:border-bs windows:desktop-shell:border-windows-stroke windows:desktop-shell:bg-background",
    swiping !== undefined &&
      "bg-background shadow-back-swipe rtl:shadow-back-swipe-rtl",
    screens.isSettling && ["transition-transform", SETTLING],
  ]}
>
  {@render children()}
</main>
