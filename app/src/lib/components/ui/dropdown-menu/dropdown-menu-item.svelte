<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    tone = "plain",
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.ItemProps & { tone?: "plain" | "danger" } = $props();
</script>

<DropdownMenuPrimitive.Item
  bind:ref
  data-slot="dropdown-menu-item"
  class={cn(
    "flex cursor-default items-center gap-sm rounded-control px-sm text-detail font-medium outline-none select-none min-block-pointer-target data-highlighted:bg-menu-highlight data-highlighted:text-on-menu-highlight touch:px-md touch:text-body touch:min-block-touch-target",
    tone === "danger" && "text-danger",
    className,
  )}
  {...restProps}
/>
