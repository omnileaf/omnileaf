<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="card-header"
  class={cn(
    "grid auto-rows-min items-start gap-icon-gap px-xl with-card-action:grid-cols-card-header",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
