<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { FilterCondition } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { CONDITION_LABELS } from "./condition-labels";

  type Look = "row" | "field";

  const REMOVE_ICON_SIZE = 12;

  const LOOKS = {
    row: {
      chip: "block-search-chip ps-search-chip-start pe-xs",
      remove: "block-chip-remove inline-chip-remove",
    },
    field: {
      chip: "block-search-chip-wide ps-label pe-xs",
      remove: "block-chip-remove-wide inline-chip-remove-wide",
    },
  } satisfies Record<Look, { chip: ClassValue; remove: ClassValue }>;

  let {
    conditions,
    onRemove,
    look,
    class: className,
  }: {
    conditions: readonly FilterCondition[];
    onRemove: (condition: FilterCondition) => void;
    look: Look;
    class?: ClassValue;
  } = $props();
</script>

<ul
  aria-label={m.search_conditions()}
  class={["flex flex-wrap gap-xs", className]}
>
  {#each conditions as condition (condition)}
    {@const removeLabel = m.search_remove_condition({
      condition: CONDITION_LABELS[condition](),
    })}
    <li
      class={[
        "inline-flex shrink-0 items-center gap-xs rounded-full bg-accent-soft text-detail font-semibold",
        LOOKS[look].chip,
      ]}
    >
      {CONDITION_LABELS[condition]()}
      <Tooltip
        label={removeLabel}
        type="button"
        aria-label={removeLabel}
        onclick={() => {
          onRemove(condition);
        }}
      >
        {#snippet child({ props })}
          <Button {...props} look="icon" class={LOOKS[look].remove}>
            <X size={REMOVE_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    </li>
  {/each}
</ul>
