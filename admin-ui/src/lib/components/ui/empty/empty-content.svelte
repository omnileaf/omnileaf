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
  data-slot="empty-content"
  class={cn("flex flex-wrap items-center justify-center gap-2", className)}
  {...restProps}
>
  {@render children?.()}
</div>
