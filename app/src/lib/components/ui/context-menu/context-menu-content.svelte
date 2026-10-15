<script lang="ts">
  import {
    ContextMenu as ContextMenuPrimitive,
    type PortalProps,
  } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  const SCREEN_EDGE_GAP_PX = 8;

  let {
    ref = $bindable(null),
    to = "body",
    class: className,
    ...restProps
  }: ContextMenuPrimitive.ContentProps & { to?: PortalProps["to"] } = $props();
</script>

<ContextMenuPrimitive.Portal {to}>
  <ContextMenuPrimitive.Content
    bind:ref
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog flex flex-col rounded-menu border border-menu-edge bg-menu p-xs text-foreground fade-motion shadow-menu backdrop-blur-menu",
      className,
    )}
    {...restProps}
  />
</ContextMenuPrimitive.Portal>
