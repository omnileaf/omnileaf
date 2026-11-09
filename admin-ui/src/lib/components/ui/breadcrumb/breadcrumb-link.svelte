<script lang="ts">
  import type { HTMLAnchorAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes, HTMLAnchorElement> = $props();
</script>

<a
  bind:this={ref}
  data-slot="breadcrumb-link"
  class={cn(
    "inline-flex items-center rounded-control min-block-11 hover:text-foreground hover:underline tablet:min-block-6",
    FOCUS_RING,
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</a>
