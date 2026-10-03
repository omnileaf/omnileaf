<script lang="ts">
  import { Check } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  let {
    checked = $bindable(false),
    onPhone,
  }: { checked?: boolean; onPhone: boolean } = $props();

  const CHECK_SIZE = 14;
  const CHECK_STROKE = 3;
</script>

<label
  class={[
    "flex cursor-pointer items-center gap-md text-start touch:min-block-touch-target",
    onPhone ? "text-label" : "text-footnote",
  ]}
>
  <span class="relative flex shrink-0">
    <input
      type="checkbox"
      bind:checked
      class="peer cursor-pointer appearance-none rounded-checkbox border-2 border-control-edge block-checkbox inline-checkbox checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    />
    <Check
      size={CHECK_SIZE}
      strokeWidth={CHECK_STROKE}
      aria-hidden="true"
      class="pointer-events-none absolute inset-none m-auto hidden text-on-accent peer-checked:block"
    />
  </span>
  {m.crash_report_always()}
</label>
