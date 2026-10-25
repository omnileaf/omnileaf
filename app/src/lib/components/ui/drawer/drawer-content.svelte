<script lang="ts">
  import {
    Dialog as DialogPrimitive,
    type PortalProps,
    type WithoutChildrenOrChild,
  } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { resolveFirstStyle } from "#lib/components/resolve-first-style.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { type SheetBackdrop, type SheetHeight, sheetLook } from "./sheet.ts";
  import { SheetDrag } from "./sheet-drag.svelte.ts";

  let {
    ref = $bindable(null),
    class: className,
    onDismiss,
    to = "body",
    height = "fit",
    backdrop = "dimmed",
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    onDismiss: () => void;
    to?: PortalProps["to"];
    height?: SheetHeight;
    backdrop?: SheetBackdrop;
    children: Snippet;
  } = $props();

  const look = sheetLook(currentPlatform());

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
    class={cn(
      "fixed inset-none z-dialog bg-scrim",
      look.scrim,
      look.backdrops[backdrop],
      !drag.isDragging && "fade-motion",
    )}
    style={drag.isDragging
      ? `opacity: ${String(drag.backdropOpacity)}`
      : undefined}
  />
  <DialogPrimitive.Content
    bind:ref
    {@attach resolveFirstStyle}
    class={cn(
      "fixed inset-none z-dialog mbs-auto flex touch-none flex-col overflow-hidden rounded-ss-bottom-sheet rounded-se-bottom-sheet bg-bottom-sheet text-foreground block-fit inline-full max-block-full desktop:border-bs desktop:border-border motion-sheets:data-starting-style:translate-y-full motion-sheets:starting:translate-y-full motion-sheets:closed:translate-y-full",
      look.surface,
      look.heights[height],
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
      class={cn(
        "mbs-sheet-handle-gap shrink-0 self-center rounded-full bg-sheet-handle block-sheet-handle-block inline-sheet-handle",
        look.handle,
      )}
    ></span>
    {@render children()}
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
