<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { Snippet } from "svelte";

  import {
    DialogContent,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";

  import type { Glyph } from "./glyph";
  import HeaderBadge from "./HeaderBadge.svelte";

  let {
    isOpen,
    icon,
    title,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    children,
  }: {
    isOpen: boolean;
    icon: Glyph;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    children: Snippet;
  } = $props();
</script>

<AlertDialog.Root
  bind:open={
    () => isOpen,
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    }
  }
>
  <DialogContent
    class="inset-none m-auto flex flex-col gap-lg overflow-auto bg-card px-sheet-inline text-foreground block-fit max-block-dialog-limit max-medium:mbe-none max-medium:sheet-motion max-medium:rounded-ss-confirm-sheet max-medium:rounded-se-confirm-sheet max-medium:pbs-sm max-medium:pbe-page-bottom max-medium:inline-full medium:rounded-panel medium:border medium:border-dialog-edge medium:py-sheet-inline medium:fade-motion medium:shadow-dialog medium:inline-dialog medium:max-inline-dialog-limit"
  >
    <span
      aria-hidden="true"
      class="self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle medium:hidden"
    ></span>
    <div class="flex items-center gap-md">
      <HeaderBadge {icon} tone="bg-danger-soft text-danger" />
      <DialogTitle
        class="text-dialog-title font-bold max-medium:text-sheet-title"
      >
        {title}
      </DialogTitle>
    </div>
    <AlertDialog.Description class="flex flex-col gap-md">
      {@render children()}
    </AlertDialog.Description>
    <div
      class="mbs-xs flex flex-col-reverse gap-sheet-buttons medium:grid medium:grid-cols-2 medium:gap-sm"
    >
      <Button type="button" look="confirm-cancel" onclick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="button" look="confirm-danger" onclick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  </DialogContent>
</AlertDialog.Root>
