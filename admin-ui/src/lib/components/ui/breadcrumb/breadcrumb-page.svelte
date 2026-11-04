<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<
    HTMLAttributes<HTMLSpanElement>,
    HTMLSpanElement
  > = $props();
</script>

<span
  bind:this={ref}
  data-slot="breadcrumb-page"
  aria-current="page"
  class={cn("font-semibold text-foreground", className)}
  {...restProps}
>
  {@render children?.()}
</span>
