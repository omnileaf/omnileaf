<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { ITEM_LOOKS, type ItemLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    look,
    class: className,
    child,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    look: ItemLook;
    child?: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  const itemProps = $derived({
    "data-slot": "item",
    class: cn(ITEM_LOOKS[look], className),
    ...restProps,
  });
</script>

{#if child}
  {@render child({ props: itemProps })}
{:else}
  <div bind:this={ref} {...itemProps}>
    {@render children?.()}
  </div>
{/if}
