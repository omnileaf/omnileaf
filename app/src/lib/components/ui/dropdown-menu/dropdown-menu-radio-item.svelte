<script lang="ts">
  import { Check } from "@lucide/svelte";
  import {
    DropdownMenu as DropdownMenuPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  const CHECK_SIZE = 16;

  let {
    ref = $bindable(null),
    class: className,
    children: label,
    ...restProps
  }: WithoutChildrenOrChild<DropdownMenuPrimitive.RadioItemProps> & {
    children: Snippet;
  } = $props();
</script>

<DropdownMenuPrimitive.RadioItem
  bind:ref
  class={cn(
    "flex cursor-default items-center gap-sm rounded-menu-item px-menu-item-inline text-label outline-none select-none min-block-menu-item data-highlighted:bg-menu-highlight data-highlighted:text-on-menu-highlight touch:min-block-touch-target",
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked }: { checked: boolean })}
    <span class="flex-1">{@render label()}</span>
    <Check
      size={CHECK_SIZE}
      aria-hidden="true"
      class={["shrink-0", !checked && "invisible"]}
    />
  {/snippet}
</DropdownMenuPrimitive.RadioItem>
