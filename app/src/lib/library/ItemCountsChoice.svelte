<script lang="ts">
  import { m } from "$lib/paraglide/messages.js";

  import SwitchTrack from "./SwitchTrack.svelte";

  let {
    isShown,
    onChoose,
  }: { isShown: boolean; onChoose: (isShown: boolean) => void } = $props();

  const hintId = $props.id();
</script>

<label
  class="flex cursor-pointer items-center gap-md border-bs border-border pbs-md min-block-switch-row large:items-start large:gap-label large:min-block-auto"
>
  <input
    type="checkbox"
    aria-describedby={hintId}
    class="peer sr-only large:not-sr-only large:order-first large:mbs-2xs large:shrink-0 large:accent-accent large:block-lg large:inline-lg"
    checked={isShown}
    onchange={(event) => {
      onChoose(event.currentTarget.checked);
    }}
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
  <SwitchTrack class="large:hidden" />
</label>
