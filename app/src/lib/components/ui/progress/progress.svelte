<script lang="ts">
  import {
    Progress as ProgressPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform, hasNativeLook } from "#lib/page/platform.ts";

  import type { NativeTrack } from "./tracks.ts";

  let {
    ref = $bindable(null),
    class: className,
    max = 100,
    value = 0,
    track = "split",
    ...restProps
  }: WithoutChildrenOrChild<ProgressPrimitive.RootProps> & {
    track?: NativeTrack;
  } = $props();

  const unfilledShare = $derived(
    max > 0 && value !== null ? 100 - (100 * value) / max : 0,
  );
  const isNative = hasNativeLook(currentPlatform());
  const NATIVE_TRACKS = {
    split: "gap-native-progress-gap bg-native-progress-track",
    continuous: "bg-native-progress-rest",
  } satisfies Record<NativeTrack, string>;
  const WINDOWS_DETERMINATE =
    "windows:relative windows:isolate windows:items-center windows:bg-transparent windows:block-native-progress-thickness windows:before:absolute windows:before:z-behind windows:before:content-[''] windows:before:bg-native-progress-track windows:before:block-native-hairline windows:before:inline-full";
</script>

<ProgressPrimitive.Root
  bind:ref
  class={cn(
    "flex overflow-hidden rounded-full rtl:-scale-x-100",
    isNative ? "block-native-progress-thickness" : "block-progress",
    isNative
      ? value === null
        ? ["gap-native-progress-gap", "bg-native-progress-idle-track"]
        : NATIVE_TRACKS[track]
      : "bg-accent/20",
    value === null
      ? "windows:bg-native-progress-idle-track windows:block-native-progress-thickness"
      : WINDOWS_DETERMINATE,
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
        isNative
          ? "bg-native-progress-fill"
          : "bg-accent windows:bg-native-progress-fill",
      ]}
    ></div>
  {:else if isNative}
    {#if unfilledShare < 100}
      <div
        class="shrink-0 rounded-full bg-native-progress-fill motion-loading:transition-all motion-loading:duration-slide motion-loading:ease-emphasized"
        style:flex-basis="{100 - unfilledShare}%"
      ></div>
    {/if}
    {#if unfilledShare > 0 && track === "split"}
      <div class="flex-1 rounded-full bg-native-progress-rest"></div>
    {/if}
  {:else}
    <div
      class="flex-1 bg-accent windows:rounded-full windows:bg-native-progress-fill windows:block-native-progress-thickness motion-loading:transition-transform motion-loading:duration-slide motion-loading:ease-emphasized"
      style:translate="-{unfilledShare}%"
    ></div>
  {/if}
</ProgressPrimitive.Root>
