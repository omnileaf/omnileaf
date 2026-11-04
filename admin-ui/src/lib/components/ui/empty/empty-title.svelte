<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    level = 2,
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement> & {
    level?: 2 | 3 | 4;
  } = $props();
</script>

<svelte:element
  this={`h${String(level)}`}
  bind:this={ref}
  data-slot="empty-title"
  class={cn("text-lead font-semibold", className)}
  {...restProps}
>
  {@render children?.()}
</svelte:element>
