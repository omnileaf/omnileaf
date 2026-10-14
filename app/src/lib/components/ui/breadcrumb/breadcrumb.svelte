<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLElement> = $props();
</script>

<nav class={cn("min-inline-none", className)} {...restProps}>
  <ol class="flex items-center gap-xs whitespace-nowrap min-inline-none">
    {@render children?.()}
  </ol>
</nav>
