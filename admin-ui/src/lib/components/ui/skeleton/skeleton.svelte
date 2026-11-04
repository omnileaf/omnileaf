<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: Omit<
    WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement>,
    "children"
  > = $props();
</script>

<div
  bind:this={ref}
  data-slot="skeleton"
  aria-hidden="true"
  class={cn("rounded-control bg-chip motion-safe:animate-pulse", className)}
  {...restProps}
></div>
