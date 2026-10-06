<script lang="ts">
  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";

  import NavigationIcon from "./NavigationIcon.svelte";
  import { type Section, SECTION_ROUTES } from "./sections";

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
  onanimationend={endArrivalOnceStill}
  class={[
    "shrink-0 border-bs border-border bg-bar ps-safe-start pbe-safe-bottom max-medium:pe-safe-end medium:flex medium:flex-col medium:border-e medium:border-bs-0 medium:pbs-safe-top medium:inline-rail expanded:inline-sidebar",
    "ios:max-medium:fixed ios:max-medium:inset-x-lg ios:max-medium:inset-be-floating-gap ios:max-medium:rounded-full ios:max-medium:border ios:max-medium:border-glass-edge ios:max-medium:bg-glass ios:max-medium:p-xs ios:max-medium:shadow-floating ios:max-medium:backdrop-blur-glass ios:max-medium:backdrop-saturate-160 ios:max-medium:block-floating-bar",
  ]}
>
  <p
    class="hidden px-xl pbs-xl pbe-xl text-brand font-bold tracking-tight expanded:block"
  >
    {m.app_name()}
  </p>
  <ul
    class="flex p-sm medium:flex-1 medium:flex-col medium:gap-md medium:pbs-lg medium:pbe-2xl expanded:gap-xs expanded:px-md expanded:pbs-none expanded:pbe-xl ios:max-medium:relative ios:max-medium:p-none ios:max-medium:block-full"
  >
    <li
      aria-hidden="true"
      style:--tab-index={currentIndex}
      style:--tab-count={DESTINATIONS.length}
      class="pointer-events-none absolute inset-s-none inset-bs-none inset-be-none hidden translate-to-tab rounded-full bg-glass-pill transition-transform inline-tab motion-safe:duration-slide motion-safe:ease-glass ios:max-medium:block"
    ></li>
    {#each DESTINATIONS as destination (destination.section)}
      {@const isSelected = destination.section === current}
      {@const isArriving = destination.section === arriving}
      <li
        class={[
          "flex-1 medium:flex-none ios:max-medium:flex",
          destination.isAtSideEnd && "medium:mbs-auto",
        ]}
      >
        <a
          href={resolve(SECTION_ROUTES[destination.section])}
          aria-current={isSelected ? "page" : undefined}
          class={[
            "group relative flex flex-col items-center gap-xs text-caption transition-control min-block-touch-target medium:py-2xs expanded:flex-row expanded:gap-md expanded:rounded-control expanded:px-md expanded:text-label desktop:expanded:min-block-pointer-target",
            "ios:max-medium:flex-1 ios:max-medium:justify-center ios:max-medium:gap-2xs ios:max-medium:rounded-full ios:max-medium:py-none ios:max-medium:text-tab ios:max-medium:font-semibold",
            isSelected
              ? "font-bold text-accent expanded:bg-accent-soft"
              : "font-medium text-muted expanded:text-sidebar-ink expanded:hover:tint-hover expanded:active:tint-pressed ios:max-medium:text-foreground",
          ]}
        >
          <span
            class={[
              "relative flex items-center justify-center rounded-full block-2xl inline-pill expanded:block-auto expanded:inline-auto ios:max-medium:block-auto ios:max-medium:inline-auto",
              !isSelected &&
                "max-expanded:group-hover:tint-hover max-expanded:group-active:tint-pressed",
            ]}
          >
            <span
              class={[
                "absolute inset-none rounded-full bg-accent-soft transition-opacity motion-safe:duration-fade motion-safe:ease-out expanded:hidden ios:max-medium:hidden",
                "android:motion-safe:duration-grow android:motion-safe:ease-emphasized",
                !isSelected && "opacity-0",
                isArriving && "android:motion-safe:animate-pill-grow",
              ]}
            ></span>
            <NavigationIcon
              section={destination.section}
              {isSelected}
              {isArriving}
              size={ICON_SIZE}
              class={[
                "relative ios:max-medium:block-xl ios:max-medium:inline-xl desktop:expanded:block-sidebar-icon desktop:expanded:inline-sidebar-icon",
                isArriving && "ios:max-medium:motion-safe:animate-nav-pop",
              ]}
            />
          </span>
          {destination.label()}
        </a>
      </li>
    {/each}
  </ul>
</nav>
