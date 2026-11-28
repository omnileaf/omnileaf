<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { navigating } from "$app/state";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { paneFoldQuery } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { categorySource } from "#lib/library/category-source.svelte.ts";
  import { tabKey } from "#lib/library/library-tabs.ts";

  import { DESTINATIONS, SIDE_END_SECTION } from "./destinations";
  import NavigationIcon from "./NavigationIcon.svelte";
  import { paneArrowKeys } from "./pane-arrow-keys.ts";
  import PaneToggle from "./PaneToggle.svelte";
  import { type Section, SECTION_ROUTE_IDS } from "./sections";
  import { getSidebarSetting } from "./sidebar.svelte.ts";
  import type { BackGoesUp } from "./back-goes-up";
  import { TabPress } from "./tab-press.svelte.ts";
  import { COLLAPSED_TAB_BAR_LOOK, tabBarLook } from "./tab-bar.ts";

  const ICON_SIZE = 22;

  type HistoryMoves = Pick<BackGoesUp, "isPassingThrough" | "isMoving">;
  const STILL_HISTORY: HistoryMoves = {
    isPassingThrough: false,
    isMoving: false,
  };

  let {
    current,
    attention,
    isCollapsed = false,
    onOpenTabTap,
    historyMoves = STILL_HISTORY,
  }: {
    current: Section;
    attention?: Snippet<[{ isFolded: boolean }]> | undefined;
    isCollapsed?: boolean;
    onOpenTabTap?: ((event: MouseEvent) => void) | undefined;
    historyMoves?: HistoryMoves;
  } = $props();

  const platform = currentPlatform();
  const platformLook = tabBarLook(platform);
  const look = $derived(isCollapsed ? COLLAPSED_TAB_BAR_LOOK : platformLook);
  const sidebar = getSidebarSetting();
  const isNarrowPane = new MediaQuery(paneFoldQuery(platform));
  const isFolded = $derived(sidebar.isHidden || isNarrowPane.current);

  const currentIndex = $derived(
    DESTINATIONS.findIndex(({ section }) => section === current),
  );

  let navigation: HTMLElement | undefined = $state();
  let arriving: Section | undefined = $state();
  let shownSection: Section | undefined = $state();
  const shown = $derived(shownSection ?? current);
  const waitsForThePagesFirstPaint = platform === "android";
  let previous: Section | undefined;
  let settling: number | undefined;
  const press = new TabPress(
    {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => {
        cancelAnimationFrame(handle);
      },
    },
    {
      start: (ms, callback) => window.setTimeout(callback, ms),
      stop: (handle) => {
        clearTimeout(handle);
      },
    },
  );

  $effect(() => {
    const next = current;
    const leaving = previous;
    previous = next;
    if (leaving === undefined) {
      shownSection = next;
      return;
    }
    if (leaving === next || historyMoves.isPassingThrough) {
      return;
    }
    if (!waitsForThePagesFirstPaint) {
      shownSection = next;
      arriving = next;
      return;
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        shownSection = next;
        arriving = next;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    if (arriving === undefined) {
      return;
    }
    const frame = requestAnimationFrame(endArrivalOnceStill);
    return () => {
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => () => {
    press.stop();
    if (settling !== undefined) {
      cancelAnimationFrame(settling);
    }
  });

  beforeNavigate(({ complete }) => {
    complete.catch(() => {
      settling = requestAnimationFrame(settleUnlessStillMoving);
    });
  });

  afterNavigate(() => {
    if (!historyMoves.isPassingThrough) {
      press.settled(current);
    }
  });

  function settleUnlessStillMoving(): void {
    settling = undefined;
    const isHistoryMoving =
      historyMoves.isMoving || historyMoves.isPassingThrough;
    if (navigating.to === null && !isHistoryMoving) {
      press.settled(current);
    }
  }

  function endArrivalOnceStill(): void {
    const isMoving = navigation
      ?.getAnimations({ subtree: true })
      .some((motion) => motion instanceof CSSAnimation);
    if (isMoving === true) {
      return;
    }
    if (arriving !== undefined) {
      press.arrived(arriving);
    }
    arriving = undefined;
  }

  function tabUnder(target: EventTarget | null): Section | undefined {
    const tab = target instanceof Element ? target.closest("[data-tab]") : null;
    if (tab === null || navigation?.contains(tab) !== true) {
      return undefined;
    }
    return DESTINATIONS.find(
      ({ section }) => section === tab.getAttribute("data-tab"),
    )?.section;
  }
</script>

<svelte:window
  onpointerdown={(event: PointerEvent) => {
    press.pointerWentDown(tabUnder(event.target));
  }}
  onclick={(event: MouseEvent) => {
    press.clicked(tabUnder(event.target), event.defaultPrevented, current);
  }}
/>

<nav
  data-app-navigation
  bind:this={navigation}
  aria-label={m.navigation_label()}
  data-sidebar-hidden={sidebar.isHidden || undefined}
  onanimationend={endArrivalOnceStill}
  class={[
    "shrink-0 border-bs border-border bg-bar ps-safe-start pbe-safe-bottom medium:flex medium:flex-col medium:border-e medium:border-bs-0 medium:pbs-safe-top medium:inline-rail expanded:inline-sidebar while-phone-picks:hidden",
    "desktop-shell:flex desktop-shell:flex-col desktop-shell:border-e desktop-shell:border-bs-0 desktop-shell:border-sidebar-edge desktop-shell:bg-shell-ground desktop-shell:pbs-safe-top desktop-shell:inline-sidebar-desktop windows:desktop-shell:border-e-0 sidebar-hidden:inline-sidebar-hidden",
    look.bar,
  ]}
>
  {#if platform === "windows"}
    <div
      class="hidden items-center px-xs block-pointer-target desktop-shell:flex"
    >
      <PaneToggle />
    </div>
  {:else}
    <p
      title={m.app_name()}
      class="hidden truncate px-xl pbs-xl pbe-xl text-brand font-bold tracking-tight expanded:block desktop-shell:flex desktop-shell:items-center desktop-shell:px-lg desktop-shell:pbs-none desktop-shell:pbe-none desktop-shell:text-body desktop-shell:font-semibold desktop-shell:tracking-normal desktop-shell:min-block-toolbar sidebar-hidden:hidden"
    >
      {m.app_name()}
    </p>
  {/if}
  <ul
    {@attach platform === "windows" && paneArrowKeys}
    class={[
      "flex p-sm medium:flex-1 medium:flex-col medium:gap-md medium:pbs-lg medium:pbe-2xl expanded:gap-xs expanded:px-md expanded:pbs-none expanded:pbe-xl desktop-shell:flex-1 desktop-shell:flex-col desktop-shell:gap-xs desktop-shell:p-sm windows:desktop-shell:px-xs sidebar-hidden:pbs-sm",
      look.row,
    ]}
  >
    <li
      aria-hidden="true"
      style:--tab-index={currentIndex}
      style:--tab-count={DESTINATIONS.length}
      class={[
        "pointer-events-none absolute inset-s-none inset-bs-none inset-be-none hidden translate-to-tab rounded-full transition-transform inline-tab motion-navigation:duration-slide motion-navigation:ease-glass",
        look.glassPill,
      ]}
    ></li>
    {#each DESTINATIONS as destination (destination.section)}
      {@const isSelected = destination.section === current}
      {@const isShown = destination.section === shown}
      {@const isWayBack = isCollapsed && isSelected}
      {@const isArriving = destination.section === arriving}
      {@const isAtSideEnd = destination.section === SIDE_END_SECTION}
      {#if isAtSideEnd && attention !== undefined}
        <li class="hidden desktop-shell:mbs-auto desktop-shell:flex">
          {@render attention({ isFolded })}
        </li>
      {/if}
      <li
        class={[
          "flex-1 min-inline-none medium:flex-none desktop-shell:flex-none",
          look.cell,
          isCollapsed && !isSelected && "hidden",
          isAtSideEnd &&
            (attention === undefined
              ? "medium:mbs-auto desktop-shell:mbs-auto"
              : "medium:mbs-auto desktop-shell:mbs-none"),
        ]}
      >
        <Tooltip
          label={isFolded ? destination.label() : undefined}
          side={document.documentElement.dir === "rtl" ? "left" : "right"}
          onclick={isSelected && !isWayBack ? onOpenTabTap : undefined}
          onpointerup={(event: PointerEvent) => {
            press.lifted(destination.section, event.button, current);
          }}
          onpointercancel={() => {
            press.longPressed();
          }}
          oncontextmenu={() => {
            press.longPressed();
          }}
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve(SECTION_ROUTE_IDS[destination.section])}
              aria-current={isSelected && !isWayBack ? "page" : undefined}
              aria-label={isWayBack ? m.search_back() : undefined}
              data-back-link={isWayBack || undefined}
              data-tab={destination.section}
              class={[
                "group relative flex flex-col items-center gap-xs text-caption transition-control min-block-touch-target medium:py-2xs expanded:flex-row expanded:gap-md expanded:rounded-row expanded:px-md expanded:text-label windows:focus-visible:ring-1 windows:focus-visible:ring-native-focus-ring-inner windows:focus-visible:focus-ring desktop-shell:flex-row desktop-shell:gap-sm desktop-shell:rounded-sidebar-row desktop-shell:px-sm desktop-shell:py-none desktop-shell:block-sidebar-row desktop-shell:min-block-sidebar-row sidebar-hidden:justify-center sidebar-hidden:px-none",
                look.tab,
                isShown
                  ? "font-bold text-accent expanded:bg-accent-soft windows:before:absolute windows:before:inset-y-none windows:before:inset-s-none windows:before:my-auto windows:before:rounded-full windows:before:bg-native-nav-indicator windows:before:block-windows-indicator-length windows:before:inline-windows-indicator desktop-shell:bg-sidebar-selection desktop-shell:font-medium desktop-shell:text-on-sidebar-selection"
                  : "font-medium text-muted expanded:text-sidebar-ink expanded:hover:tint-hover expanded:active:tint-pressed desktop-shell:font-regular desktop-shell:hover:bg-sidebar-accent desktop-shell:hover:text-on-sidebar-accent windows:desktop-shell:active:bg-native-nav-item-pressed windows:desktop-shell:active:text-on-sidebar-accent",
                isShown ? look.currentTab : look.otherTab,
              ]}
            >
              <span
                class={[
                  "relative flex items-center justify-center rounded-full block-2xl inline-pill expanded:block-auto expanded:inline-auto desktop-shell:block-auto desktop-shell:inline-auto",
                  look.iconHolder,
                  !isSelected &&
                    "max-expanded:group-hover:tint-hover max-expanded:group-active:tint-pressed",
                  "android:max-expanded:motion-navigation:data-held-press:tint-pressed",
                ]}
                data-held-press={press.held === destination.section ||
                  undefined}
              >
                <span
                  data-slot="navigation-pill"
                  class={[
                    "absolute inset-none rounded-full bg-accent-soft transition-opacity expanded:hidden desktop-shell:hidden motion-navigation:duration-fade motion-navigation:ease-out",
                    "android:motion-navigation:duration-grow android:motion-navigation:ease-emphasized",
                    look.tone,
                    !isShown && "opacity-0",
                    isArriving && "android:motion-navigation:animate-pill-grow",
                  ]}
                ></span>
                <NavigationIcon
                  section={destination.section}
                  isSelected={isShown}
                  {isArriving}
                  size={ICON_SIZE}
                  class={[
                    "relative macos:inactive:text-muted desktop-shell:block-sidebar-icon desktop-shell:inline-sidebar-icon",
                    look.icon,
                    isShown && look.currentIcon,
                    isArriving &&
                      "ios:max-medium:motion-navigation:animate-nav-pop",
                  ]}
                />
              </span>
              <span
                class={[
                  "truncate max-inline-full sidebar-hidden:sr-only",
                  isCollapsed && "sr-only",
                ]}
              >
                {destination.label()}
              </span>
            </a>
          {/snippet}
        </Tooltip>
      </li>
    {/each}
  </ul>
  {#if platform === "macos" && categorySource.tabs.length > 0}
    <div class="hidden px-sm pbe-md desktop-shell:block">
      <p class="px-sm pbs-sm text-caption font-semibold text-muted">
        {m.library_categories()}
      </p>
      <ul aria-label={m.library_categories()} class="flex flex-col gap-2xs">
        {#each categorySource.tabs as tab (tab.id)}
          {@const key = tabKey(tab.id)}
          <li>
            <button
              type="button"
              aria-current={categorySource.chosen === key ? "true" : undefined}
              class={[
                "flex items-center rounded-sidebar-row px-sm text-start text-small transition-control block-sidebar-row inline-full hover:bg-sidebar-accent",
                categorySource.chosen === key &&
                  "bg-sidebar-selection font-medium text-on-sidebar-selection",
              ]}
              onclick={() => {
                categorySource.choose(key);
              }}
            >
              <span class="truncate">{tab.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</nav>
