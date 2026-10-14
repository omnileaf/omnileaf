<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span aria-current="page" class={cn("truncate", className)} {...restProps}>
  {@render children?.()}
</span>
