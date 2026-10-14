<script lang="ts">
  import type { WithElementRef } from "bits-ui";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";

  import { BADGE_LOOKS, type BadgeLook } from "./looks.ts";

  let {
    ref = $bindable(null),
    look,
    class: className,
    child,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    look: BadgeLook;
    child?: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  const badgeProps = $derived({
    "data-slot": "badge",
    class: cn(BADGE_LOOKS[look], className),
    ...restProps,
  });
</script>

{#if child}
  {@render child({ props: badgeProps })}
{:else}
  <span bind:this={ref} {...badgeProps}>
    {@render children?.()}
  </span>
{/if}
