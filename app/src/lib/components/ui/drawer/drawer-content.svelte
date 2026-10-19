<script lang="ts">
  import {
    Dialog as DialogPrimitive,
    type PortalProps,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  import { SheetDrag } from "./sheet-drag.svelte.ts";

  let {
    ref = $bindable(null),
    class: className,
    onDismiss,
    to = "body",
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    onDismiss: () => void;
    to?: PortalProps["to"];
    children: Snippet;
  } = $props();

  const drag = new SheetDrag(() => {
    onDismiss();
  });

  function sheetOf(event: PointerEvent): HTMLElement | undefined {
    return event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;
  }

  function press(event: PointerEvent): void {
    const sheet = sheetOf(event);
    if (sheet !== undefined) {
      drag.pressed(event, sheet);
    }
  }

  function move(event: PointerEvent): void {
    const sheet = sheetOf(event);
    if (sheet !== undefined) {
      drag.moved(event, sheet);
    }
  }
</script>

<DialogPrimitive.Portal {to}>
  <DialogPrimitive.Overlay
    class={[
      "fixed inset-none z-dialog bg-scrim",
      !drag.isDragging && "fade-motion",
    ]}
    style={drag.isDragging
      ? `opacity: ${String(drag.backdropOpacity)}`
      : undefined}
  />
  <DialogPrimitive.Content
    bind:ref
    class={cn(
      "fixed inset-none z-dialog mbs-auto flex touch-none flex-col overflow-hidden rounded-ss-bottom-sheet rounded-se-bottom-sheet bg-card text-foreground block-fit inline-full max-block-full motion-sheets:starting:translate-y-full motion-sheets:closed:translate-y-full",
      !drag.isDragging &&
        "motion-sheets:transition-transform motion-sheets:duration-slide motion-sheets:ease-glass",
      className,
    )}
    style={drag.isDragging
      ? `translate: 0 ${String(drag.offset)}px`
      : undefined}
    onpointerdown={press}
    onpointermove={move}
    onpointerup={() => {
      drag.released();
    }}
    onpointercancel={() => {
      drag.cancelled();
    }}
    {...restProps}
  >
    <span
      aria-hidden="true"
      class="mbs-sm shrink-0 self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle"
    ></span>
    {@render children()}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
