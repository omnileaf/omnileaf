<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    alertLook,
    TODAYS_ALERT_LOOK,
  } from "#lib/components/ui/dialog/alert-look.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";

  import type { Glyph } from "./glyph";
  import HeaderBadge from "./HeaderBadge.svelte";
  import { currentPlatform } from "./platform";

  type ConfirmTone = "danger" | "accent";

  const BADGE_LOOKS = {
    danger: "header-danger",
    accent: "header-accent",
  } as const satisfies Record<ConfirmTone, string>;
  const CONFIRM_FILLS = {
    danger: "",
    accent:
      "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed",
  } as const satisfies Record<ConfirmTone, string>;

  const DIALOG =
    "inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-dialog px-sheet-inline py-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit";

  let {
    isOpen,
    icon,
    title,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    phoneLook = "sheet",
    tone = "danger",
    isBusy = false,
    children,
  }: {
    isOpen: boolean;
    icon: Glyph;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    phoneLook?: "sheet" | "dialog";
    tone?: ConfirmTone;
    isBusy?: boolean;
    children: Snippet;
  } = $props();

  const isAlert = $derived(phoneLook === "dialog");
  const alert = $derived(
    isAlert ? alertLook(currentPlatform()) : TODAYS_ALERT_LOOK,
  );

  function confirm(): void {
    if (!isBusy) {
      onConfirm();
    }
  }
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
    wideClass={DIALOG}
    phoneLook={isAlert ? "dialog" : "drawer"}
    phoneClass={isAlert
      ? cn(DIALOG, alert.surface)
      : "gap-lg rounded-ss-confirm-sheet rounded-se-confirm-sheet px-sheet-inline pbe-page-bottom max-block-dialog-limit"}
    phoneOverlayClass={alert.scrim}
    onDismiss={onCancel}
  >
    <div class="flex items-center gap-md">
      <HeaderBadge {icon} look={BADGE_LOOKS[tone]} class={alert.badge} />
      <DialogTitle
        class={cn(
          "text-dialog-title font-bold max-medium:text-sheet-title",
          alert.title,
        )}
      >
        {title}
      </DialogTitle>
    </div>
    <div
      class={cn(
        "-m-sm flex flex-col gap-lg overflow-auto p-sm min-block-none",
        alert.body,
      )}
    >
      <AlertDialog.Description
        class={cn("flex flex-col gap-md", alert.description)}
      >
        {@render children()}
      </AlertDialog.Description>
      <div
        class={[
          "mbs-xs windows:medium:rounded-ee-panel windows:medium:rounded-es-panel windows:medium:border-bs windows:medium:border-windows-stroke windows:medium:bg-windows-mica",
          isAlert
            ? cn("grid grid-cols-2 gap-sm", alert.actions)
            : "flex flex-col-reverse gap-sheet-buttons medium:grid medium:grid-cols-2 medium:gap-sm",
        ]}
      >
        <Button
          type="button"
          look="confirm-cancel"
          class={alert.cancel}
          onclick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          look="confirm-danger"
          class={cn(CONFIRM_FILLS[tone], alert.confirm)}
          aria-disabled={isBusy || undefined}
          onclick={confirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  </ModalContent>
</AlertDialog.Root>
