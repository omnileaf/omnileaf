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

  import { backSwipeEdge, type TextDirection } from "./back-swipe";
  import { BackSwipeScreens } from "./back-swipe-screens.svelte";
  import { PreviousScreens, type ScreenCopy } from "./previous-screens";

  interface SwipeStart {
    readonly area: DOMRect;
    readonly previousScreen: ScreenCopy | undefined;
    readonly direction: TextDirection;
  }

  const BACK_LINK = "a[data-back-link]";
  const SWITCH = '[role="switch"]';
  const SETTLING =
    "duration-slide ease-glass motion-reduce:duration-grow motion-reduce:ease-out";

  let { isIos, children }: { isIos: boolean; children: Snippet } = $props();

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

  /** A link hidden by `display: none`, as where the sections are listed beside, has no boxes. */
  function backLinkIn(screen: HTMLElement): HTMLAnchorElement | null {
    const link = screen.querySelector<HTMLAnchorElement>(BACK_LINK);
    return link !== null && link.getClientRects().length > 0 ? link : null;
  }

  function directionOf(screen: HTMLElement): TextDirection {
    return getComputedStyle(screen).direction === "rtl" ? "rtl" : "ltr";
  }

  function goBack(): boolean {
    const link = main === undefined ? null : backLinkIn(main);
    link?.click();
    return link !== null;
  }

  function startOf(screen: HTMLElement): SwipeStart | undefined {
    const link = backLinkIn(screen);
    if (link === null) {
      return undefined;
    }
    return {
      area: screen.getBoundingClientRect(),
      previousScreen: previousScreens.of(new URL(link.href).pathname),
      direction: directionOf(screen),
    };
  }

  /** Restates a swipe measured across the whole web view as one across the screen it moves. */
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
      screens.follow(acrossScreen(swipe, swipeStart.area));
    }
  }

  /** Settles once the screen's transitions end or are cancelled, at once when none run. */
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

  /** A setting changed on a screen may show on the screens above it, so their copies are no longer true to them. */
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

  /** Waits for the heading to take the focus on arrival, which scrolls the screen to it. */
  function scrollAsShown(copy: ScreenCopy): void {
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
      scrollAsShown(landedOn);
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
      backSwipeEdge(backLinkIn(main) !== null, directionOf(main)),
    );
  });

  onMount(() => {
    if (isIos) {
      void commands.watchBackSwipes(new Channel(follow));
    }
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
    "order-2 flex flex-1 flex-col overflow-y-auto px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance",
    swiping !== undefined &&
      "bg-background shadow-back-swipe rtl:shadow-back-swipe-rtl",
    screens.isSettling && ["transition-transform", SETTLING],
  ]}
>
  {@render children()}
</main>
