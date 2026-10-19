<script lang="ts">
  import { Check } from "@lucide/svelte";

  const CHECK_SIZE = 14;

  let { isOn }: { isOn: boolean } = $props();
</script>

<span
  aria-hidden="true"
  class={[
    "absolute inset-e-xs inset-bs-xs flex items-center justify-center rounded-series-check border-2 block-series-check inline-series-check",
    isOn
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card",
  ]}
>
  {#if isOn}
    <Check size={CHECK_SIZE} strokeWidth={3} />
  {/if}
</span>
