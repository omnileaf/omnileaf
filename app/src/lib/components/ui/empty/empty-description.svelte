<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<p
  bind:this={ref}
  data-slot="empty-description"
  class={cn("text-muted", className)}
  {...restProps}
>
  {@render children?.()}
</p>
