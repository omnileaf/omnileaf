<script lang="ts">
  import {
    Checkbox as CheckboxPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  import CheckMark from "./check-mark.svelte";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  bind:ref
  bind:checked
  class={cn(
    "flex shrink-0 items-center justify-center rounded-checkbox border-2 border-control-edge text-on-accent block-checkbox inline-checkbox focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-checked:border-accent aria-checked:bg-accent",
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked: isChecked })}
    {#if isChecked}
      <CheckMark />
    {/if}
  {/snippet}
</CheckboxPrimitive.Root>
