<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLTableAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> = $props();
</script>

<table
  bind:this={ref}
  data-slot="table"
  class={cn("border-collapse text-detail inline-full", className)}
  {...restProps}
>
  {@render children?.()}
</table>
