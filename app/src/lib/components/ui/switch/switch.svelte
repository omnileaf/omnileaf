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
    class="flex shrink-0 items-center rounded-full border border-switch-edge bg-switch-off px-switch-inset transition-colors block-switch-thickness inline-switch-length group-aria-checked/switch:justify-end group-aria-checked/switch:border-switch-edge-on group-aria-checked/switch:bg-switch-on group-aria-checked/switch:px-switch-inset-on motion-safe:duration-fade ios:border-0 android:border-2 macos:shadow-raised linux:shadow-raised"
  >
    <SwitchPrimitive.Thumb
      class="flex items-center justify-center rounded-full bg-switch-knob block-switch-knob inline-switch-knob group-aria-checked/switch:bg-switch-knob-on group-aria-checked/switch:block-switch-knob-on group-aria-checked/switch:inline-switch-knob-on ios:shadow-switch-knob macos:shadow-switch-knob"
    >
      <Check
        size={TICK_SIZE}
        class="hidden text-accent android:group-aria-checked/switch:block"
      />
    </SwitchPrimitive.Thumb>
  </span>
</SwitchPrimitive.Root>
