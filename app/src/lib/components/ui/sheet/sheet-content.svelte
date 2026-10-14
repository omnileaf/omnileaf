<script lang="ts">
  import {
    Dialog as DialogPrimitive,
    type PortalProps,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  let {
    ref = $bindable(null),
    class: className,
    to = "body",
    dimsBehind = false,
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    to?: PortalProps["to"];
    dimsBehind?: boolean;
    children: Snippet;
  } = $props();
</script>

<DialogPrimitive.Portal {to}>
  <DialogPrimitive.Overlay
    class={cn(
      "fixed inset-none z-dialog",
      dimsBehind && "bg-scrim fade-motion",
    )}
  />
  <DialogPrimitive.Content
    bind:ref
    class={cn(
      "fixed inset-none inset-s-auto z-dialog flex flex-col overflow-hidden border-s border-border bg-card text-foreground side-panel-shadow max-inline-full motion-safe:transition-transform motion-safe:duration-slide motion-safe:ease-glass motion-safe:starting:translate-x-full motion-safe:rtl:starting:-translate-x-full motion-safe:closed:translate-x-full motion-safe:rtl:closed:-translate-x-full",
      className,
    )}
    {...restProps}
  >
    {@render children()}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
