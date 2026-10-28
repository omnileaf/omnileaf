<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { emptyLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

  const look = emptyLook(currentPlatform());
</script>

<h2
  bind:this={ref}
  data-slot="empty-title"
  class={cn("mbs-sm font-medium tracking-tight", look.title, className)}
  {...restProps}
>
  {@render children?.()}
</h2>
