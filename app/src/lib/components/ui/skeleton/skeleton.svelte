<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="skeleton"
  aria-hidden="true"
  class={cn(
    "rounded-shadcn-control bg-hover motion-safe:animate-pulse",
    className,
  )}
  {...restProps}
></div>
