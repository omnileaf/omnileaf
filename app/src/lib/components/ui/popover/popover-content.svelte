<script lang="ts">
  import {
    Popover as PopoverPrimitive,
    type PortalProps,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  const OPENER_GAP_PX = 8;
  const SCREEN_EDGE_GAP_PX = 8;

  let {
    ref = $bindable(null),
    class: className,
    to = "body",
    children,
    ...restProps
  }: WithoutChildrenOrChild<PopoverPrimitive.ContentProps> & {
    to?: PortalProps["to"];
    children: Snippet;
  } = $props();
</script>

<PopoverPrimitive.Portal {to}>
  <PopoverPrimitive.Overlay class="fixed inset-none z-dialog" />
  <PopoverPrimitive.Content
    bind:ref
    role="dialog"
    sideOffset={OPENER_GAP_PX}
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog rounded-popover border border-menu-edge bg-popover-surface text-foreground fade-motion shadow-menu backdrop-blur-menu",
      className,
    )}
    {...restProps}
  >
    {@render children()}
  </PopoverPrimitive.Content>
</PopoverPrimitive.Portal>
