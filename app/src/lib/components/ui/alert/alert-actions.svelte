<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="alert-actions"
  class={cn("col-start-2 mbs-sm flex flex-wrap gap-sm", className)}
  {...restProps}
>
  {@render children?.()}
</div>
