<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

  import { cn } from "#lib/components/cn.ts";

  const OPENER_GAP_PX = 8;
  const SCREEN_EDGE_GAP_PX = 8;

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.ContentProps = $props();
</script>

<DropdownMenuPrimitive.Portal>
  <DropdownMenuPrimitive.Content
    bind:ref
    sideOffset={OPENER_GAP_PX}
    collisionPadding={SCREEN_EDGE_GAP_PX}
    class={cn(
      "z-dialog flex flex-col rounded-card border border-border bg-card p-xs text-foreground fade-motion shadow-popover",
      className,
    )}
    {...restProps}
  />
</DropdownMenuPrimitive.Portal>
