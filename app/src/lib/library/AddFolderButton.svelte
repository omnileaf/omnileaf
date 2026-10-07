<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";

  type Placement = "page-heading" | "empty-state" | "section-heading";

  const LOOKS = {
    "page-heading":
      "-my-sm gap-sm rounded-control border border-field bg-card ps-md enabled:hover:tint-hover enabled:active:tint-pressed pe-lg text-foreground min-block-touch-target desktop:-my-xs desktop:text-label desktop:min-block-pointer-target touch:max-medium:-me-sm touch:max-medium:gap-xs touch:max-medium:rounded-full touch:max-medium:border-transparent touch:max-medium:bg-transparent touch:max-medium:px-md touch:max-medium:text-accent",
    "empty-state":
      "gap-sm rounded-control bg-accent ps-lg pe-button text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed min-block-touch-target desktop:text-label desktop:min-block-pointer-target",
    "section-heading":
      "gap-xs rounded-control bg-accent ps-md pe-lg text-callout text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed min-block-touch-target desktop:text-label desktop:min-block-pointer-button",
  } satisfies Record<Placement, string>;

  const ICON_SIZE = 20;

  let {
    adding,
    placement,
    element = $bindable(),
  }: {
    adding: FolderAdding;
    placement: Placement;
    element?: HTMLButtonElement | undefined;
  } = $props();
</script>

<button
  bind:this={element}
  type="button"
  class={[
    "inline-flex shrink-0 items-center justify-center font-semibold transition-control disabled:opacity-60",
    LOOKS[placement],
  ]}
  disabled={adding.isAdding}
  onclick={() => {
    void adding.add();
  }}
>
  <Plus size={ICON_SIZE} />
  {m.library_add_folder()}
</button>
