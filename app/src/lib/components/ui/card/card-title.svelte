<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<h2
  bind:this={ref}
  data-slot="card-title"
  class={cn("font-semibold", className)}
  {...restProps}
>
  {@render children?.()}
</h2>
