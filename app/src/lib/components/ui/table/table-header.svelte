<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<thead
  bind:this={ref}
  data-slot="table-header"
  class={cn(
    "border-be border-border bg-well text-caption font-semibold text-muted",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</thead>
