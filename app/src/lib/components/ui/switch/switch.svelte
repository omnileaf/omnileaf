<script lang="ts">
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
    class="flex shrink-0 items-center rounded-full bg-switch-off p-switch-inset transition-colors block-switch-thickness inline-switch-length group-aria-checked/switch:justify-end group-aria-checked/switch:bg-switch-on motion-safe:duration-fade expanded:block-switch-thickness-compact expanded:inline-switch-length-compact"
  >
    <SwitchPrimitive.Thumb
      class="rounded-full bg-switch-knob shadow-knob block-switch-knob inline-switch-knob group-aria-checked/switch:bg-switch-knob-on expanded:block-switch-knob-compact expanded:inline-switch-knob-compact"
    />
  </span>
</SwitchPrimitive.Root>
