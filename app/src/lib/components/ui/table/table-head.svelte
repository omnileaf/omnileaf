<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLThAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> = $props();
</script>

<th
  bind:this={ref}
  data-slot="table-head"
  class={cn(
    "px-sm text-start align-middle font-semibold whitespace-nowrap block-series-columns first:ps-md last:pe-md",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</th>
