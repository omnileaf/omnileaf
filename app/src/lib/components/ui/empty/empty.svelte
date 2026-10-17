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

<section
  bind:this={ref}
  data-slot="empty"
  class={cn(
    "flex flex-col items-center gap-sm text-center text-balance",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</section>
