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

<h2
  bind:this={ref}
  data-slot="empty-title"
  class={cn("mbs-sm text-title font-bold", className)}
  {...restProps}
>
  {@render children?.()}
</h2>
