<script lang="ts">
  import { resolve } from "$app/paths";
  import { m } from "#lib/paraglide/messages.js";

  import { DESTINATIONS } from "./destinations";
  import { type Section, SECTION_ROUTE_IDS } from "./sections";

  let { current }: { current: Section } = $props();
</script>

<nav
  aria-label={m.navigation_label()}
  class="fixed inset-x-lg inset-bs-page-top z-top-tab-bar mx-auto rounded-full bg-native-tab-bar p-xs shadow-floating inset-ring inset-ring-glass-edge backdrop-blur-glass backdrop-saturate-160 block-native-top-tab-bar inline-auto max-inline-fit"
>
  <ul class="flex block-full">
    {#each DESTINATIONS as { section, label } (section)}
      {@const isSelected = section === current}
      <li class="flex min-inline-native-top-tab">
        <a
          href={resolve(SECTION_ROUTE_IDS[section])}
          aria-current={isSelected ? "page" : undefined}
          class={[
            "flex flex-1 items-center justify-center rounded-full px-lg text-native-button/native-button font-native-bar-button tracking-native-button transition-control min-inline-none active:opacity-50",
            isSelected
              ? "bg-native-tab-pill text-native-on-tab-pill"
              : "text-native-on-tab",
          ]}><span class="truncate">{label()}</span></a
        >
      </li>
    {/each}
  </ul>
</nav>
