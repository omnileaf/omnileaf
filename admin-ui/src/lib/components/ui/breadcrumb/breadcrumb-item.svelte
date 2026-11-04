<script lang="ts">
  import type { HTMLLiAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLLiAttributes, HTMLLIElement> = $props();
</script>

<li
  bind:this={ref}
  data-slot="breadcrumb-item"
  class={cn("inline-flex items-center gap-2", className)}
  {...restProps}
>
  {@render children?.()}
</li>
