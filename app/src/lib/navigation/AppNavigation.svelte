<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";

  import { resolve } from "$app/paths";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { NARROW_POINTER_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import NavigationIcon from "./NavigationIcon.svelte";
  import { type Section, SECTION_ROUTE_IDS } from "./sections";
  import { getSidebarSetting } from "./sidebar.svelte.ts";

  interface Destination {
    readonly section: Section;
    readonly label: () => string;
    readonly isAtSideEnd: boolean;
  }

  const ICON_SIZE = 22;

  const DESTINATIONS: readonly Destination[] = [
    {
      section: "library",
      label: m.library_title,
      isAtSideEnd: false,
    },
    {
      section: "browse",
      label: m.browse_title,
      isAtSideEnd: false,
    },
    {
      section: "history",
      label: m.history_title,
      isAtSideEnd: false,
    },
    {
      section: "settings",
      label: m.settings_title,
      isAtSideEnd: true,
    },
  ];

  let { current }: { current: Section } = $props();

  const sidebar = getSidebarSetting();
  const isNarrowPointer = new MediaQuery(NARROW_POINTER_QUERY);
  const isFolded = $derived(sidebar.isHidden || isNarrowPointer.current);

  const currentIndex = $derived(
    DESTINATIONS.findIndex(({ section }) => section === current),
  );

  let navigation: HTMLElement | undefined = $state();
  let arriving: Section | undefined = $state();
  let previous: Section | undefined;

  $effect(() => {
    if (previous !== undefined && previous !== current) {
      arriving = current;
    }
    previous = current;
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

  function endArrivalOnceStill(): void {
    const isMoving = navigation
      ?.getAnimations({ subtree: true })
      .some((motion) => motion instanceof CSSAnimation);
    if (isMoving !== true) {
      arriving = undefined;
    }
  }
</script>

<nav
  bind:this={navigation}
  aria-label={m.navigation_label()}
  data-sidebar-hidden={sidebar.isHidden || undefined}
  onanimationend={endArrivalOnceStill}
  class={[
    "shrink-0 border-bs border-border bg-bar ps-safe-start pbe-safe-bottom max-medium:pe-safe-end medium:flex medium:flex-col medium:border-e medium:border-bs-0 medium:pbs-safe-top medium:inline-rail expanded:inline-sidebar android:max-medium:border-bs-0 android:max-medium:bg-android-container",
    "desktop-shell:flex desktop-shell:flex-col desktop-shell:border-e desktop-shell:border-bs-0 desktop-shell:border-sidebar-edge desktop-shell:bg-sidebar desktop-shell:pbs-safe-top desktop-shell:inline-sidebar-desktop sidebar-hidden:inline-sidebar-hidden",
    "ios:max-medium:fixed ios:max-medium:inset-x-lg ios:max-medium:inset-be-floating-gap ios:max-medium:z-tab-bar ios:max-medium:rounded-full ios:max-medium:border ios:max-medium:border-glass-edge ios:max-medium:bg-glass ios:max-medium:p-xs ios:max-medium:shadow-floating ios:max-medium:backdrop-blur-glass ios:max-medium:backdrop-saturate-160 ios:max-medium:block-floating-bar",
  ]}
>
  <p
    title={m.app_name()}
    class="hidden truncate px-xl pbs-xl pbe-xl text-brand font-bold tracking-tight expanded:block desktop-shell:flex desktop-shell:items-center desktop-shell:px-lg desktop-shell:pbs-none desktop-shell:pbe-none desktop-shell:text-body desktop-shell:font-semibold desktop-shell:tracking-normal desktop-shell:min-block-toolbar sidebar-hidden:hidden"
  >
    {m.app_name()}
  </p>
  <ul
    class="flex p-sm medium:flex-1 medium:flex-col medium:gap-md medium:pbs-lg medium:pbe-2xl expanded:gap-xs expanded:px-md expanded:pbs-none expanded:pbe-xl ios:max-medium:relative ios:max-medium:p-none ios:max-medium:block-full android:max-medium:pbs-md android:max-medium:pbe-lg desktop-shell:flex-1 desktop-shell:flex-col desktop-shell:gap-xs desktop-shell:p-sm sidebar-hidden:pbs-sm"
  >
    <li
      aria-hidden="true"
      style:--tab-index={currentIndex}
      style:--tab-count={DESTINATIONS.length}
      class="pointer-events-none absolute inset-s-none inset-bs-none inset-be-none hidden translate-to-tab rounded-full bg-glass-pill transition-transform inline-tab ios:max-medium:block motion-navigation:duration-slide motion-navigation:ease-glass"
    ></li>
    {#each DESTINATIONS as destination (destination.section)}
      {@const isSelected = destination.section === current}
      {@const isArriving = destination.section === arriving}
      <li
        class={[
          "flex-1 min-inline-none medium:flex-none ios:max-medium:flex desktop-shell:flex-none",
          destination.isAtSideEnd && "medium:mbs-auto desktop-shell:mbs-auto",
        ]}
      >
        <Tooltip
          label={isFolded ? destination.label() : undefined}
          side={document.documentElement.dir === "rtl" ? "left" : "right"}
        >
          {#snippet child({ props })}
            <a
              {...props}
              href={resolve(SECTION_ROUTE_IDS[destination.section])}
              aria-current={isSelected ? "page" : undefined}
              class={[
                "group relative flex flex-col items-center gap-xs text-caption transition-control min-block-touch-target medium:py-2xs expanded:flex-row expanded:gap-md expanded:rounded-row expanded:px-md expanded:text-label desktop-shell:flex-row desktop-shell:gap-sm desktop-shell:rounded-sidebar-row desktop-shell:px-sm desktop-shell:py-none desktop-shell:block-sidebar-row desktop-shell:min-block-sidebar-row sidebar-hidden:justify-center sidebar-hidden:px-none",
                "ios:max-medium:flex-1 ios:max-medium:justify-center ios:max-medium:gap-2xs ios:max-medium:rounded-full ios:max-medium:py-none ios:max-medium:text-tab ios:max-medium:font-semibold",
                isSelected
                  ? "font-bold text-accent expanded:bg-accent-soft android:max-medium:font-semibold android:max-medium:text-foreground desktop:expanded:bg-sidebar-selection desktop:expanded:text-on-sidebar-selection desktop-shell:bg-sidebar-accent desktop-shell:font-medium desktop-shell:text-on-sidebar-accent"
                  : "font-medium text-muted expanded:text-sidebar-ink expanded:hover:tint-hover expanded:active:tint-pressed ios:max-medium:text-foreground android:max-medium:text-android-tab-ink desktop-shell:font-regular desktop-shell:hover:bg-sidebar-accent desktop-shell:hover:text-on-sidebar-accent",
              ]}
            >
              <span
                class={[
                  "relative flex items-center justify-center rounded-full block-2xl inline-pill expanded:block-auto expanded:inline-auto ios:max-medium:block-auto ios:max-medium:inline-auto desktop-shell:block-auto desktop-shell:inline-auto",
                  !isSelected &&
                    "max-expanded:group-hover:tint-hover max-expanded:group-active:tint-pressed",
                ]}
              >
                <span
                  data-slot="navigation-pill"
                  class={[
                    "absolute inset-none rounded-full bg-accent-soft transition-opacity expanded:hidden ios:max-medium:hidden android:bg-android-tonal desktop-shell:hidden motion-navigation:duration-fade motion-navigation:ease-out",
                    "android:motion-navigation:duration-grow android:motion-navigation:ease-emphasized",
                    !isSelected && "opacity-0",
                    isArriving && "android:motion-navigation:animate-pill-grow",
                  ]}
                ></span>
                <NavigationIcon
                  section={destination.section}
                  {isSelected}
                  {isArriving}
                  size={ICON_SIZE}
                  class={[
                    "relative ios:max-medium:block-xl ios:max-medium:inline-xl desktop-shell:block-sidebar-icon desktop-shell:inline-sidebar-icon",
                    isArriving &&
                      "ios:max-medium:motion-navigation:animate-nav-pop",
                  ]}
                />
              </span>
              <span class="truncate max-inline-full sidebar-hidden:sr-only"
                >{destination.label()}</span
              >
            </a>
          {/snippet}
        </Tooltip>
      </li>
    {/each}
  </ul>
</nav>
