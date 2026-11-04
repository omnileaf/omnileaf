<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<
    HTMLAttributes<HTMLParagraphElement>,
    HTMLParagraphElement
  > = $props();
</script>

<p
  bind:this={ref}
  data-slot="card-description"
  class={cn("text-small text-muted", className)}
  {...restProps}
>
  {@render children?.()}
</p>
