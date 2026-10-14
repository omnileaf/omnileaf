<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import type { WithElementRef } from "bits-ui";
  import type { HTMLSelectAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  const ICON_SIZE = 16;

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLSelectAttributes, HTMLSelectElement> = $props();
</script>

<div class={cn("relative flex items-center", className)}>
  <select
    bind:this={ref}
    class="flex-1 appearance-none rounded-control border border-border bg-card ps-md pe-select-end text-detail font-medium block-panel-field"
    {...restProps}
  >
    {@render children?.()}
  </select>
  <ChevronDown
    size={ICON_SIZE}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-pill-inline text-muted"
  />
</div>
