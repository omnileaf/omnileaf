<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> = $props();
</script>

<div
  bind:this={ref}
  data-slot="empty"
  class={cn(
    "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border p-8 text-center text-balance min-inline-0",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
