<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";

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
  <ModalContent
    wideClass="inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-card px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="gap-lg rounded-ss-confirm-sheet rounded-se-confirm-sheet px-sheet-inline pbe-page-bottom max-block-dialog-limit"
    onDismiss={onCancel}
  >
    <div class="flex items-center gap-md">
      <HeaderBadge {icon} look="header-danger" />
      <DialogTitle
        class="text-dialog-title font-bold max-medium:text-sheet-title"
      >
        {title}
      </DialogTitle>
    </div>
    <div class="flex flex-col gap-lg overflow-auto min-block-none">
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
    </div>
  </ModalContent>
</AlertDialog.Root>
