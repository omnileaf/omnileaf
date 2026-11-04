<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    children,
    ...restProps
  }: WithElementRef<
    HTMLAttributes<HTMLTableSectionElement>,
    HTMLTableSectionElement
  > = $props();
</script>

<thead bind:this={ref} data-slot="table-header" {...restProps}>
  {@render children?.()}
</thead>
