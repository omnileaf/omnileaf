<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLTdAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTdAttributes> = $props();
</script>

<td
  bind:this={ref}
  data-slot="table-cell"
  class={cn("px-sm align-middle first:ps-md last:pe-md", className)}
  {...restProps}
>
  {@render children?.()}
</td>
