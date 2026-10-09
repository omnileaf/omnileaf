<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";

  type Placement =
    "page-heading" | "empty-state" | "section-heading" | "below-list";

  const LOOKS = {
    "page-heading":
      "-my-sm gap-sm enabled:hover:tint-hover enabled:active:tint-pressed min-block-touch-target max-medium:rounded-full max-medium:text-accent max-medium:inline-touch-target medium:rounded-control medium:border medium:border-field medium:bg-card medium:ps-md medium:pe-lg medium:text-foreground desktop:text-label desktop:medium:-my-xs desktop:medium:min-block-pointer-button touch:max-medium:-me-sm",
    "empty-state":
      "gap-sm rounded-control bg-accent ps-lg pe-button text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed min-block-touch-target touch:max-medium:min-block-phone-button android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label desktop:min-block-pointer-target",
    "section-heading":
      "gap-xs rounded-control bg-accent ps-md pe-lg text-callout text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-pressed min-block-touch-target android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label desktop:min-block-pointer-button",
    "below-list":
      "gap-sm rounded-control border border-accent px-lg text-accent inline-full enabled:hover:bg-hover enabled:active:bg-pressed min-block-touch-target touch:max-medium:font-bold touch:max-medium:min-block-phone-button android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label desktop:min-block-pointer-target",
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

  const isInHeading = $derived(placement === "page-heading");
</script>

<button
  bind:this={element}
  type="button"
  class={[
    "inline-flex shrink-0 items-center justify-center font-semibold transition-control disabled:opacity-60",
    LOOKS[placement],
  ]}
  title={isInHeading ? m.library_add_folder() : undefined}
  disabled={adding.isAdding}
  onclick={() => {
    void adding.add();
  }}
>
  <Plus size={ICON_SIZE} />
  <span class={{ "max-medium:sr-only": isInHeading }}
    >{m.library_add_folder()}</span
  >
</button>
