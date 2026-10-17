<script lang="ts">
  import {
    Checkbox as CheckboxPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { CheckMark } from "#lib/components/ui/checkbox/index.ts";

  let {
    checked = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  bind:checked
  class={cn(
    "group/look flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-checked:bg-accent max-large:order-last max-large:rounded-full max-large:bg-switch-off max-large:p-switch-inset max-large:block-switch-thickness-compact max-large:inline-switch-length-compact max-large:aria-checked:justify-end large:justify-center large:rounded-checkbox large:border-2 large:border-control-edge large:text-on-accent large:block-lg large:inline-lg large:aria-checked:border-accent",
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked: isChecked })}
    <span
      class="rounded-full bg-switch-knob block-switch-knob-compact inline-switch-knob-compact group-aria-checked/look:bg-switch-knob-on large:hidden"
    ></span>
    {#if isChecked}
      <CheckMark class="max-large:hidden" />
    {/if}
  {/snippet}
</CheckboxPrimitive.Root>
