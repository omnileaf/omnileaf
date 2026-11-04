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

<tbody bind:this={ref} data-slot="table-body" {...restProps}>
  {@render children?.()}
</tbody>
