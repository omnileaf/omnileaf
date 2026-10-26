<script lang="ts">
  import {
    Dialog as DialogPrimitive,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    overlayClass,
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    children: Snippet;
    overlayClass?: string | undefined;
  } = $props();
</script>

<DialogPrimitive.Portal>
  <DialogPrimitive.Overlay
    class={cn("fixed inset-none z-dialog bg-scrim fade-motion", overlayClass)}
  />
  <DialogPrimitive.Content
    bind:ref
    class={cn("fixed z-dialog", className)}
    {...restProps}
  >
    {@render children()}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
