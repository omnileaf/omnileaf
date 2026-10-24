<script lang="ts">
  import {
    ContextMenu as ContextMenuPrimitive,
    type PortalProps,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { menuLook } from "../menu-look.ts";

  const SCREEN_EDGE_GAP_PX = 8;

  let {
    ref = $bindable(null),
    to = "body",
    class: className,
    ...restProps
  }: ContextMenuPrimitive.ContentProps & { to?: PortalProps["to"] } = $props();
  const look = menuLook(currentPlatform());
</script>

<ContextMenuPrimitive.Portal {to}>
  <ContextMenuPrimitive.Content
    bind:ref
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog flex flex-col rounded-menu border border-menu-edge bg-menu p-menu-pad text-foreground fade-motion shadow-menu backdrop-blur-menu android:medium:px-none android:medium:py-sm",
      look.surface,
      className,
    )}
    {...restProps}
  />
</ContextMenuPrimitive.Portal>
