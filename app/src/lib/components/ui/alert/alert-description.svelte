<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p
  data-slot="alert-description"
  class={cn("col-start-2 text-footnote opacity-85", className)}
  {...restProps}
>
  {@render children?.()}
</p>
