<script lang="ts">
  import type { SmartFilter } from "#lib/ipc/bindings.ts";

  import { SMART_HINTS, SMART_LABELS } from "./filter-labels";
  import ViewSwitchRow from "./ViewSwitchRow.svelte";

  let {
    offered,
    chosen,
    onToggle,
  }: {
    offered: readonly SmartFilter[];
    chosen: readonly SmartFilter[];
    onToggle: (smart: SmartFilter) => void;
  } = $props();
</script>

{#each offered as smart (smart)}
  <ViewSwitchRow
    label={SMART_LABELS[smart]()}
    description={SMART_HINTS[smart]()}
    isOn={chosen.includes(smart)}
    onToggle={() => {
      onToggle(smart);
    }}
  />
{/each}
