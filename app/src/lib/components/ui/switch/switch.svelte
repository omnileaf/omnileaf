<script lang="ts">
  import { Check } from "@lucide/svelte";
  import {
    Switch as SwitchPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    class: className,
    children,
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
    children?: Snippet;
  } = $props();

  const TICK_SIZE = 16;
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  class={cn("group/switch", className)}
  {...restProps}
>
  {@render children?.()}
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center rounded-full border border-native-switch-off-border bg-native-switch-off px-native-switch-inset transition-colors block-native-switch-thickness inline-native-switch-length group-aria-checked/switch:justify-end group-aria-checked/switch:border-native-switch-on-border group-aria-checked/switch:bg-native-switch-on group-aria-checked/switch:px-native-switch-inset-on motion-safe:duration-fade ios:border-0 android:border-2 macos:shadow-raised linux:shadow-raised"
  >
    <SwitchPrimitive.Thumb
      class="flex items-center justify-center rounded-full bg-native-switch-thumb-off block-native-switch-knob inline-native-switch-knob-length group-aria-checked/switch:bg-native-switch-thumb group-aria-checked/switch:block-native-switch-knob-on group-aria-checked/switch:inline-native-switch-knob-on-length ios:shadow-switch-knob macos:shadow-switch-knob"
    >
      <Check
        size={TICK_SIZE}
        class="hidden text-native-switch-on android:group-aria-checked/switch:block"
      />
    </SwitchPrimitive.Thumb>
  </span>
</SwitchPrimitive.Root>
