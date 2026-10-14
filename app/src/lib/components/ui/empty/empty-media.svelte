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

<span
  bind:this={ref}
  data-slot="empty-media"
  class={cn(
    "flex items-center justify-center rounded-empty-media bg-chip text-foreground block-empty-art inline-empty-art",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</span>
