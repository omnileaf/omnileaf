<script lang="ts">
  import {
    Progress as ProgressPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform, hasNativeLook } from "#lib/page/platform.ts";

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
  const isNative = hasNativeLook(currentPlatform());
</script>

<ProgressPrimitive.Root
  bind:ref
  class={cn(
    "flex overflow-hidden rounded-full block-progress rtl:-scale-x-100",
    isNative
      ? [
          "gap-native-progress-gap",
          value === null
            ? "bg-native-progress-idle-track"
            : "bg-native-progress-track",
        ]
      : "bg-accent/20",
    className,
  )}
  {value}
  {max}
  {...restProps}
>
  {#if value === null}
    <div
      class={[
        "progress-band rounded-full",
        isNative ? "bg-native-progress-fill" : "bg-accent",
      ]}
    ></div>
  {:else if isNative}
    {#if unfilledShare < 100}
      <div
        class="shrink-0 rounded-full bg-native-progress-fill motion-loading:transition-all motion-loading:duration-slide motion-loading:ease-emphasized"
        style:flex-basis="{100 - unfilledShare}%"
      ></div>
    {/if}
    {#if unfilledShare > 0}
      <div class="flex-1 rounded-full bg-native-progress-rest"></div>
    {/if}
  {:else}
    <div
      class="flex-1 bg-accent motion-loading:transition-transform motion-loading:duration-slide motion-loading:ease-emphasized"
      style:translate="-{unfilledShare}%"
    ></div>
  {/if}
</ProgressPrimitive.Root>
