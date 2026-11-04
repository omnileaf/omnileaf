<script lang="ts">
  import type { HTMLTdAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTdAttributes, HTMLTableCellElement> = $props();
</script>

<td
  bind:this={ref}
  data-slot="table-cell"
  class={cn("px-4 py-3.5 align-middle", className)}
  {...restProps}
>
  {@render children?.()}
</td>
