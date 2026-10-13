<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { Button, type ButtonLook } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { FolderAdding } from "./folder-adding.svelte";

  type Placement =
    "page-heading" | "empty-state" | "section-heading" | "below-list";

  const LOOKS = {
    "page-heading": "tinted",
    "empty-state": "primary",
    "section-heading": "primary",
    "below-list": "tinted",
  } satisfies Record<Placement, ButtonLook>;

  const PLACEMENTS = {
    "page-heading":
      "-my-sm gap-sm min-block-touch-target max-medium:rounded-full max-medium:text-accent max-medium:inline-touch-target medium:rounded-control medium:border medium:border-field medium:bg-card medium:ps-md medium:pe-lg medium:text-foreground desktop:text-label desktop:medium:-my-xs desktop:medium:min-block-pointer-button touch:max-medium:-me-sm",
    "empty-state":
      "gap-sm rounded-control ps-lg pe-button min-block-touch-target touch:max-medium:min-block-phone-button android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label desktop:min-block-pointer-target",
    "section-heading":
      "gap-xs rounded-control ps-md pe-lg text-callout min-block-touch-target android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label desktop:min-block-pointer-button",
    "below-list":
      "gap-sm rounded-control border border-dashed border-accent bg-accent-soft px-lg text-accent inline-full min-block-long-button touch:max-medium:font-bold android:max-medium:rounded-full ios:max-medium:rounded-phone-button desktop:text-label",
  } satisfies Record<Placement, string>;

  const ICON_SIZE = 20;

  let {
    adding,
    placement,
    element = $bindable(null),
  }: {
    adding: FolderAdding;
    placement: Placement;
    element?: HTMLElement | null;
  } = $props();

  const isInHeading = $derived(placement === "page-heading");
</script>

<Tooltip
  bind:ref={element}
  label={isInHeading ? m.library_add_folder() : undefined}
  type="button"
  disabled={adding.isAdding}
  onclick={() => {
    void adding.add();
  }}
>
  {#snippet child({ props })}
    <Button
      {...props}
      look={LOOKS[placement]}
      class={[
        "inline-flex shrink-0 items-center justify-center font-semibold disabled:opacity-60",
        PLACEMENTS[placement],
      ]}
    >
      <Plus size={ICON_SIZE} />
      <span class={{ "max-medium:sr-only": isInHeading }}
        >{m.library_add_folder()}</span
      >
    </Button>
  {/snippet}
</Tooltip>
