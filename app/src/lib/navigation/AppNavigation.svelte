<script lang="ts">
  import {
    BookOpen,
    Compass,
    type LucideIcon,
    RotateCcwClock,
    Settings,
  } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";

  import { type Section, SECTION_ROUTES } from "./sections";

  interface Destination {
    readonly section: Section;
    readonly label: () => string;
    readonly icon: LucideIcon;
    readonly isAtSidebarEnd: boolean;
  }

  const ICON_SIZE = 22;

  const DESTINATIONS: readonly Destination[] = [
    {
      section: "library",
      label: m.library_title,
      icon: BookOpen,
      isAtSidebarEnd: false,
    },
    {
      section: "browse",
      label: m.browse_title,
      icon: Compass,
      isAtSidebarEnd: false,
    },
    {
      section: "history",
      label: m.history_title,
      icon: RotateCcwClock,
      isAtSidebarEnd: false,
    },
    {
      section: "settings",
      label: m.settings_title,
      icon: Settings,
      isAtSidebarEnd: true,
    },
  ];

  let { current }: { current: Section } = $props();
</script>

<nav
  aria-label={m.navigation_label()}
  class="shrink-0 border-bs border-border bg-bar pbe-safe-bottom medium:border-e medium:border-bs-0 medium:pbe-lg medium:inline-rail expanded:flex expanded:flex-col expanded:inline-sidebar"
>
  <p class="hidden px-lg pbs-xl pbe-lg text-title font-bold expanded:block">
    {m.app_name()}
  </p>
  <ul
    class="flex p-sm medium:flex-col medium:gap-sm medium:pbs-lg expanded:flex-1 expanded:gap-xs expanded:px-md expanded:pbs-none"
  >
    {#each DESTINATIONS as destination (destination.section)}
      {@const isCurrent = destination.section === current}
      <li
        class={[
          "flex-1 medium:flex-none",
          destination.isAtSidebarEnd && "expanded:mbs-auto",
        ]}
      >
        <a
          href={resolve(SECTION_ROUTES[destination.section])}
          aria-current={isCurrent ? "page" : undefined}
          class={[
            "flex flex-col items-center gap-xs py-xs text-caption min-block-touch-target expanded:flex-row expanded:gap-md expanded:rounded-control expanded:px-md expanded:text-body",
            isCurrent
              ? "font-bold text-foreground expanded:bg-accent-soft"
              : "font-medium text-muted",
          ]}
        >
          <span
            class={[
              "flex items-center justify-center rounded-card px-lg py-xs expanded:p-none",
              isCurrent && "bg-accent-soft expanded:bg-transparent",
            ]}
          >
            <destination.icon size={ICON_SIZE} />
          </span>
          {destination.label()}
        </a>
      </li>
    {/each}
  </ul>
</nav>
