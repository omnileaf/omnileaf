<script lang="ts">
  import type { HTMLOlAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLOlAttributes, HTMLOListElement> = $props();
</script>

<ol
  bind:this={ref}
  data-slot="breadcrumb-list"
  class={cn(
    "flex flex-wrap items-center gap-2 text-small wrap-break-word text-muted",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</ol>
