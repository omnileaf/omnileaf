<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<
    HTMLAttributes<HTMLTableRowElement>,
    HTMLTableRowElement
  > = $props();
</script>

<tr
  bind:this={ref}
  data-slot="table-row"
  class={cn("border-be border-border last:border-0", className)}
  {...restProps}
>
  {@render children?.()}
</tr>
