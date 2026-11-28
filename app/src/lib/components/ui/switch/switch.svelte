<script lang="ts">
  import {
    Switch as SwitchPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    class: className,
    children,
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
    children?: Snippet;
  } = $props();

  const TRACK =
    "flex shrink-0 items-center rounded-full border border-native-switch-off-border bg-native-switch-off px-native-switch-inset transition-[color,background-color,border-color] block-native-switch-thickness inline-native-switch-length group-aria-checked/switch:justify-end group-aria-checked/switch:border-native-switch-on-border group-aria-checked/switch:bg-native-switch-on group-aria-checked/switch:px-native-switch-inset-on motion-safe:duration-fade ios:border-0 android:border-2 android:group-data-disabled/switch:border-native-switch-off-border/10 android:group-data-disabled/switch:bg-native-switch-off/10 android:group-data-disabled/switch:group-aria-checked/switch:border-transparent android:group-data-disabled/switch:group-aria-checked/switch:bg-disabled-container macos:shadow-raised linux:shadow-raised";

  const ANDROID_FOCUSED_ROOT = "android:outline-none";

  const ANDROID_FOCUSED_TRACK = "android:group-focus-visible/switch:focus-ring";

  const THUMB =
    "rounded-full bg-native-switch-thumb-off block-native-switch-knob inline-native-switch-knob-length group-aria-checked/switch:bg-native-switch-thumb group-aria-checked/switch:block-native-switch-knob-on group-aria-checked/switch:inline-native-switch-knob-on-length ios:shadow-switch-knob android:group-data-disabled/switch:bg-foreground/38 android:group-data-disabled/switch:group-aria-checked/switch:bg-background macos:shadow-switch-knob";

  const ANDROID_PRESSED_THUMB =
    "android:relative android:motion-navigation:transition-[inline-size,block-size,margin] android:duration-morph android:ease-emphasized android:group-enabled/switch:group-active/switch:block-native-switch-knob-pressed android:group-enabled/switch:group-active/switch:inline-native-switch-knob-pressed android:group-enabled/switch:group-active/switch:mx-[calc((var(--spacing-native-switch-knob)-var(--spacing-native-switch-knob-pressed))/2)] android:group-enabled/switch:group-active/switch:group-aria-checked/switch:mx-[calc((var(--spacing-native-switch-knob-on)-var(--spacing-native-switch-knob-pressed))/2)] android:group-enabled/switch:group-active/switch:bg-native-switch-thumb-pressed-off android:group-enabled/switch:group-active/switch:group-aria-checked/switch:bg-native-switch-thumb-pressed android:group-focus-visible/switch:group-aria-checked/switch:bg-native-switch-thumb-pressed";

  const ANDROID_TRACK = "android:relative android:isolate";

  const ANDROID_HALO =
    "pointer-events-none absolute z-behind rounded-full inline-native-target inset-y-[calc((100%-var(--spacing-native-target))/2)] inset-s-[calc(var(--spacing-native-switch-inset)+var(--spacing-native-switch-knob-length)/2-var(--spacing-native-target)/2)] group-aria-checked/switch:inset-s-auto group-aria-checked/switch:inset-e-[calc(var(--spacing-native-switch-inset-on)+var(--spacing-native-switch-knob-on-length)/2-var(--spacing-native-target)/2)] group-enabled/switch:group-active/switch:bg-native-switch-halo group-enabled/switch:group-active/switch:group-aria-checked/switch:bg-native-switch-halo-on";

  const isAndroid = currentPlatform() === "android";
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  class={cn(
    "group/switch",
    children === undefined && ANDROID_FOCUSED_ROOT,
    className,
  )}
  {...restProps}
>
  {@render children?.()}
  <span
    aria-hidden="true"
    class={[
      TRACK,
      ANDROID_TRACK,
      children === undefined && ANDROID_FOCUSED_TRACK,
    ]}
  >
    <SwitchPrimitive.Thumb class={[THUMB, ANDROID_PRESSED_THUMB]} />
    {#if isAndroid}
      <span data-switch-halo class={ANDROID_HALO}></span>
    {/if}
  </span>
</SwitchPrimitive.Root>
