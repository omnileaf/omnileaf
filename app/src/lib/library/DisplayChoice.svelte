<script lang="ts">
  import { Grid3x3, LayoutGrid, List, type LucideProps } from "@lucide/svelte";
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
    class="mbs-sm grid grid-cols-3 gap-xs rounded-card bg-chip p-2xs large:mbs-icon-gap"
  >
    {#each CHOICES as choice (choice.display)}
      <label
        class={[
          "relative flex items-center justify-center gap-icon-gap rounded-field text-lead transition-control block-segment before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent",
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
