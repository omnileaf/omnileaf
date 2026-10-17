<script lang="ts">
  import {
    Progress as ProgressPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    max = 100,
    value = 0,
    ...restProps
  }: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();

  const unfilledShare = $derived(
    max > 0 && value !== null ? 100 - (100 * value) / max : 0,
  );
</script>

<ProgressPrimitive.Root
  bind:ref
  class={cn(
    "flex overflow-hidden rounded-full bg-accent/20 block-progress rtl:-scale-x-100",
    className,
  )}
  {value}
  {max}
  {...restProps}
>
  {#if value === null}
    <div class="progress-band rounded-full bg-accent"></div>
  {:else}
    <div
      class="flex-1 bg-accent motion-loading:transition-transform motion-loading:duration-slide motion-loading:ease-emphasized"
      style:translate="-{unfilledShare}%"
    ></div>
  {/if}
</ProgressPrimitive.Root>
