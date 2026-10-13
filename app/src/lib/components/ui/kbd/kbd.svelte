<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
  bind:this={ref}
  data-slot="kbd"
  class={cn(
    "shrink-0 rounded-badge border border-border bg-chip px-key-inline py-key-block font-ui text-caption font-bold",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</kbd>
