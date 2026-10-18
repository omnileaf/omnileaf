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
    "inline-block shrink-0 rounded-badge bg-chip px-xs py-2xs text-center font-ui text-caption font-medium text-on-key min-inline-key",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</kbd>
