<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { menuLook } from "../menu-look.ts";

  let {
    ref = $bindable(null),
    tone = "plain",
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.ItemProps & { tone?: "plain" | "danger" } = $props();
  const look = menuLook(currentPlatform());
</script>

<DropdownMenuPrimitive.Item
  bind:ref
  data-slot="dropdown-menu-item"
  class={cn(
    "flex cursor-default items-center gap-sm rounded-menu-item px-menu-item-inline text-label outline-none select-none min-block-menu-item data-highlighted:bg-menu-highlight data-highlighted:text-on-menu-highlight touch:medium:px-md touch:medium:text-body touch:medium:min-block-touch-target",
    look.item,
    tone === "danger" && ["text-danger", look.dangerItem],
    className,
  )}
  {...restProps}
/>
