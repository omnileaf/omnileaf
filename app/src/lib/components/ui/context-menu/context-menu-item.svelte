<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: ContextMenuPrimitive.ItemProps = $props();
</script>

<ContextMenuPrimitive.Item
  bind:ref
  data-slot="context-menu-item"
  class={cn(
    "flex cursor-default items-center gap-sm rounded-menu-item px-menu-item-inline text-label outline-none select-none min-block-menu-item data-highlighted:bg-menu-highlight data-highlighted:text-on-menu-highlight",
    className,
  )}
  {...restProps}
/>
