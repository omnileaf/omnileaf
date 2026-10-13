<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import SwitchLookCheckbox from "./SwitchLookCheckbox.svelte";

  let {
    isShown,
    onChoose,
  }: { isShown: boolean; onChoose: (isShown: boolean) => void } = $props();

  const hintId = $props.id();
</script>

<label
  class="flex items-center gap-md border-bs border-border pbs-md min-block-switch-row large:items-start large:gap-label large:min-block-auto"
>
  <SwitchLookCheckbox
    bind:checked={() => isShown, onChoose}
    aria-describedby={hintId}
    class="large:mbs-2xs"
  />
  <span class="flex flex-1 flex-col gap-2xs">
    <span class="text-body font-semibold large:text-small">
      {m.library_item_counts()}
    </span>
    <span
      id={hintId}
      aria-hidden="true"
      class="text-detail text-muted large:text-caption"
    >
      {m.library_item_counts_hint()}
    </span>
  </span>
</label>
