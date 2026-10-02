<script lang="ts">
  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";

  import NavigationIcon from "./NavigationIcon.svelte";
  import { type Section, SECTION_ROUTES } from "./sections";

  interface Destination {
    readonly section: Section;
    readonly label: () => string;
    readonly isAtSidebarEnd: boolean;
  }

  const ICON_SIZE = 22;

  const DESTINATIONS: readonly Destination[] = [
    {
      section: "library",
      label: m.library_title,
      isAtSidebarEnd: false,
    },
    {
      section: "browse",
      label: m.browse_title,
      isAtSidebarEnd: false,
    },
    {
      section: "history",
      label: m.history_title,
      isAtSidebarEnd: false,
    },
    {
      section: "settings",
      label: m.settings_title,
      isAtSidebarEnd: true,
    },
  ];

  let { current }: { current: Section } = $props();

  const currentIndex = $derived(
    DESTINATIONS.findIndex(({ section }) => section === current),
  );
</script>

<nav
  aria-label={m.navigation_label()}
  class={[
    "shrink-0 border-bs border-border bg-bar ps-safe-start pbe-safe-bottom max-medium:pe-safe-end medium:border-e medium:border-bs-0 medium:pbs-safe-top medium:inline-rail expanded:flex expanded:flex-col expanded:inline-sidebar",
    "ios:max-medium:fixed ios:max-medium:inset-x-lg ios:max-medium:inset-be-floating-gap ios:max-medium:rounded-full ios:max-medium:border ios:max-medium:border-glass-edge ios:max-medium:bg-glass ios:max-medium:p-xs ios:max-medium:shadow-floating ios:max-medium:backdrop-blur-glass ios:max-medium:backdrop-saturate-160 ios:max-medium:block-floating-bar",
  ]}
>
  <p class="hidden px-lg pbs-xl pbe-lg text-title font-bold expanded:block">
    {m.app_name()}
  </p>
  <ul
    class="flex p-sm medium:flex-col medium:gap-sm medium:pbs-lg medium:pbe-xl expanded:flex-1 expanded:gap-xs expanded:px-md expanded:pbs-none ios:max-medium:relative ios:max-medium:p-none ios:max-medium:block-full"
  >
    <li
      aria-hidden="true"
      style:--tab-index={currentIndex}
      class="pointer-events-none absolute inset-s-none inset-bs-none inset-be-none hidden translate-to-tab rounded-full bg-glass-pill transition-transform inline-1/4 motion-safe:duration-slide motion-safe:ease-glass ios:max-medium:block"
    ></li>
    {#each DESTINATIONS as destination (destination.section)}
      {@const isSelected = destination.section === current}
      <li
        class={[
          "flex-1 medium:flex-none ios:max-medium:flex",
          destination.isAtSidebarEnd && "expanded:mbs-auto",
        ]}
      >
        <a
          href={resolve(SECTION_ROUTES[destination.section])}
          aria-current={isSelected ? "page" : undefined}
          class={[
            "relative flex flex-col items-center gap-xs py-xs text-caption transition-colors min-block-touch-target motion-safe:duration-fade motion-safe:ease-out expanded:flex-row expanded:gap-md expanded:rounded-control expanded:px-md expanded:text-body",
            "ios:max-medium:flex-1 ios:max-medium:justify-center ios:max-medium:gap-2xs ios:max-medium:rounded-full ios:max-medium:py-none ios:max-medium:text-tab ios:max-medium:font-semibold",
            isSelected
              ? "font-bold text-accent expanded:bg-accent-soft"
              : "font-medium text-muted ios:max-medium:text-foreground",
          ]}
        >
          <span
            class="relative flex items-center justify-center px-lg py-xs expanded:p-none ios:max-medium:p-none"
          >
            <span
              class={[
                "absolute inset-none rounded-card bg-accent-soft transition-opacity motion-safe:duration-fade motion-safe:ease-out expanded:hidden ios:max-medium:hidden",
                "android:motion-safe:duration-grow android:motion-safe:ease-emphasized",
                isSelected
                  ? "android:motion-safe:animate-pill-grow"
                  : "opacity-0",
              ]}
            ></span>
            <NavigationIcon
              section={destination.section}
              {isSelected}
              size={ICON_SIZE}
              class={[
                "relative ios:max-medium:block-xl ios:max-medium:inline-xl",
                isSelected && "ios:max-medium:motion-safe:animate-nav-pop",
              ]}
            />
          </span>
          {destination.label()}
        </a>
      </li>
    {/each}
  </ul>
</nav>
