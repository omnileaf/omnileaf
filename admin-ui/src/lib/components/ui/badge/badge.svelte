<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  import { BADGE_BASE, BADGE_VARIANTS, type BadgeVariant } from "./variants.ts";

  let {
    ref = $bindable(null),
    class: className,
    variant = "soft",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> & {
    variant?: BadgeVariant;
  } = $props();
</script>

<span
  bind:this={ref}
  data-slot="badge"
  class={cn(BADGE_BASE, BADGE_VARIANTS[variant], className)}
  {...restProps}
>
  {@render children?.()}
</span>
