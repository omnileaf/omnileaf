<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="card"
  class={cn(
    "rounded-shadcn-card border border-border bg-card text-foreground android:border-transparent android:bg-android-container-low ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell ios-grouped:shadow-none",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
