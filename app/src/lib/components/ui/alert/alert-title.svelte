<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    level,
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLElement> & { level?: 2 | 3 | 4 } = $props();
</script>

<svelte:element
  this={level === undefined ? "p" : `h${String(level)}`}
  data-slot="alert-title"
  class={cn(
    "col-start-2 text-label font-bold touch:max-medium:text-callout",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</svelte:element>
