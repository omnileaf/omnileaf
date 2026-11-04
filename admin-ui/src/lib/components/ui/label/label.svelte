<script lang="ts">
  import type { HTMLLabelAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLLabelAttributes, HTMLLabelElement> = $props();
</script>

<label
  bind:this={ref}
  data-slot="label"
  class={cn(
    "flex items-center gap-2 text-small font-medium text-foreground select-none",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</label>
