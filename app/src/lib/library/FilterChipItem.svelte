<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const REMOVE_ICON_SIZE = 12;

  let { label, onRemove }: { label: string; onRemove: () => void } = $props();

  const removeLabel = $derived(m.library_remove_filter({ filter: label }));
</script>

<Badge look="filter" class="ps-search-chip-start pe-2xs block-search-chip">
  {#snippet child({ props })}
    <li {...props}>
      {label}
      <Tooltip
        label={removeLabel}
        type="button"
        aria-label={removeLabel}
        onclick={onRemove}
      >
        {#snippet child({ props: removeProps })}
          <Button
            {...removeProps}
            look="icon"
            class="block-chip-remove inline-chip-remove touch:touch-target-around"
          >
            <X size={REMOVE_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    </li>
  {/snippet}
</Badge>
