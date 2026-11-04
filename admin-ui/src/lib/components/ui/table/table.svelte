<script lang="ts">
  import type { HTMLTableAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLTableAttributes, HTMLTableElement> = $props();
</script>

<div data-slot="table-container" class="relative overflow-x-auto inline-full">
  <table
    bind:this={ref}
    data-slot="table"
    class={cn("caption-bottom text-small inline-full", className)}
    {...restProps}
  >
    {@render children?.()}
  </table>
</div>
