<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { SelectionAction } from "./selection-actions.ts";

  const ICON_SIZE = 16;

  let {
    actions,
    onDelete,
  }: { actions: readonly SelectionAction[]; onDelete: () => void } = $props();

  const everyAction = $derived([
    ...actions,
    {
      name: "delete",
      icon: Trash,
      label: m.library_delete(),
      act: onDelete,
    },
  ]);
</script>

<div
  role="group"
  aria-label={m.library_selection_toolbar()}
  class="flex items-center gap-2xs"
>
  {#each everyAction as { name, icon: Icon, label, act } (name)}
    <Tooltip {label} type="button" aria-label={label} onclick={act}>
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class="block-pointer-button inline-pointer-button"
        >
          <Icon size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/each}
</div>
