<script lang="ts">
  import type { HTMLThAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes, HTMLTableCellElement> = $props();
</script>

<th
  bind:this={ref}
  data-slot="table-head"
  class={cn(
    "border-be border-border bg-well px-4 text-start align-middle text-label font-semibold whitespace-nowrap text-muted block-10",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</th>
