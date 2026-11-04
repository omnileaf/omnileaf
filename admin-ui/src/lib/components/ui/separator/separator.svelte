<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/cn.ts";
  import type { WithElementRef } from "#lib/components/ui/types.ts";

  let {
    ref = $bindable(null),
    orientation = "horizontal",
    decorative = false,
    class: className,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
  } = $props();
</script>

{#if orientation === "vertical"}
  <div
    bind:this={ref}
    data-slot="separator"
    data-orientation="vertical"
    role={decorative ? "none" : "separator"}
    aria-orientation={decorative ? undefined : "vertical"}
    class={cn("shrink-0 bg-border inline-px min-block-full", className)}
    {...restProps}
  ></div>
{:else}
  <hr
    bind:this={ref}
    data-slot="separator"
    data-orientation="horizontal"
    role={decorative ? "none" : undefined}
    class={cn("shrink-0 border-0 bg-border block-px inline-full", className)}
    {...restProps}
  />
{/if}
