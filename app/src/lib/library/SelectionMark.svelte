<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  const CHECK_SIZE = 14;

  let {
    isOn,
    class: className,
    onClass,
    offClass,
    tickClass,
  }: {
    isOn: boolean;
    class?: ClassValue;
    onClass?: ClassValue;
    offClass?: ClassValue;
    tickClass?: ClassValue;
  } = $props();
</script>

<span
  aria-hidden="true"
  data-slot="selection-mark"
  class={cn(
    "absolute inset-e-xs inset-bs-xs flex items-center justify-center rounded-series-check border-2 block-series-check inline-series-check",
    className,
    isOn
      ? ["border-foreground bg-foreground text-background", onClass]
      : ["border-border bg-card", offClass],
  )}
>
  {#if isOn}
    <Check size={CHECK_SIZE} strokeWidth={3} class={tickClass} />
  {/if}
</span>
