<script lang="ts">
  import {
    Grid3x3,
    Images,
    LayoutGrid,
    List,
    type LucideProps,
  } from "@lucide/svelte";
  import type { Component } from "svelte";

  import type { LibraryDisplay } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  interface Choice {
    readonly display: LibraryDisplay;
    readonly label: () => string;
    readonly icon: Component<LucideProps>;
  }

  const ICON_SIZE = 16;

  const CHOICES: readonly Choice[] = [
    { display: "grid", label: m.library_display_grid, icon: LayoutGrid },
    { display: "compact", label: m.library_display_compact, icon: Grid3x3 },
    { display: "covers", label: m.library_display_covers, icon: Images },
    { display: "list", label: m.library_display_list, icon: List },
  ];

  let {
    chosen,
    onChoose,
  }: { chosen: LibraryDisplay; onChoose: (display: LibraryDisplay) => void } =
    $props();

  const group = $props.id();
</script>

<fieldset>
  <legend class="text-detail font-semibold text-muted large:text-caption">
    {m.library_view_display()}
  </legend>
  <div
    class="mbs-sm grid grid-cols-4 gap-xs rounded-field bg-chip p-xs large:mbs-icon-gap large:rounded-small-control large:p-segment-track"
  >
    {#each CHOICES as choice (choice.display)}
      <label
        class={[
          "relative flex items-center justify-center gap-icon-gap rounded-small-control px-2xs text-detail transition-control block-segment before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent large:rounded-segment large:text-caption large:block-segment-compact",
          chosen === choice.display
            ? "bg-raised font-bold shadow-raised"
            : "font-medium text-muted hover:bg-hover",
        ]}
      >
        <input
          type="radio"
          name={group}
          value={choice.display}
          class="sr-only"
          checked={chosen === choice.display}
          onchange={() => {
            onChoose(choice.display);
          }}
        />
        <choice.icon
          size={ICON_SIZE}
          aria-hidden="true"
          class="large:block-segment-icon-desktop large:inline-segment-icon-desktop"
        />
        {choice.label()}
      </label>
    {/each}
  </div>
</fieldset>
