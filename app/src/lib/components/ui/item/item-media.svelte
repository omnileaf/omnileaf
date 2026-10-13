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
  data-slot="item-media"
  class={cn("flex shrink-0 items-center justify-center", className)}
  {...restProps}
>
  {@render children?.()}
</span>
