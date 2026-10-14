<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    size,
    label,
    class: className,
  }: { size: number; label?: string; class?: ClassValue } = $props();
</script>

<LoaderCircle
  {size}
  aria-hidden="true"
  data-slot="spinner"
  class={cn("motion-safe:animate-spin", className)}
/>
{#if label !== undefined}
  <span class="sr-only">{label}</span>
{/if}
