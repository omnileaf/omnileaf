<script lang="ts">
  import {
    DropdownMenu as DropdownMenuPrimitive,
    type PortalProps,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { menuLook } from "../menu-look.ts";

  const OPENER_GAP_PX = 8;
  const SCREEN_EDGE_GAP_PX = 8;

  let {
    ref = $bindable(null),
    to = "body",
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.ContentProps & { to?: PortalProps["to"] } = $props();
  const look = menuLook(currentPlatform());
</script>

<DropdownMenuPrimitive.Portal {to}>
  <DropdownMenuPrimitive.Content
    bind:ref
    sideOffset={OPENER_GAP_PX}
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog flex flex-col rounded-menu border border-menu-edge bg-menu p-menu-pad text-foreground fade-motion shadow-menu backdrop-blur-menu android:medium:px-none android:medium:py-sm",
      look.surface,
      className,
    )}
    {...restProps}
  />
</DropdownMenuPrimitive.Portal>
