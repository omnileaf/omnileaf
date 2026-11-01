<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    type AlertAction,
    alertLook,
    type AlertTone,
    CONTENT_DIALOG_PANEL,
    type ConfirmPhoneLook,
    type IosPhoneConfirmLook,
    opensAsAlert,
    TODAYS_ALERT_LOOK,
  } from "#lib/components/ui/dialog/alert-look.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";

  import type { Glyph } from "./glyph";
  import HeaderBadge from "./HeaderBadge.svelte";
  import { currentPlatform } from "./platform";

  const BADGE_LOOKS = {
    danger: "header-danger",
    accent: "header-accent",
  } as const satisfies Record<AlertTone, string>;
  const CONFIRM_FILLS = {
    danger: "",
    accent:
      "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed",
  } as const satisfies Record<AlertTone, string>;

  let {
    isOpen,
    icon,
    title,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    phoneLook = "sheet",
    iosPhoneLook,
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
    phoneLook?: ConfirmPhoneLook;
    iosPhoneLook?: IosPhoneConfirmLook | undefined;
    tone?: AlertTone;
    isBusy?: boolean;
    children: Snippet;
  } = $props();

  const isAlert = $derived(
    opensAsAlert(currentPlatform(), phoneLook, iosPhoneLook),
  );
  const alert = $derived(
    isAlert ? alertLook(currentPlatform(), iosPhoneLook) : TODAYS_ALERT_LOOK,
  );

  const buttons: Record<AlertAction, HTMLButtonElement | null> = $state({
    cancel: null,
    confirm: null,
  });

  function focusDefaultButton(event: Event): void {
    event.preventDefault();
    buttons[alert.defaultAction[tone]]?.focus();
  }

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
    wideClass={cn(CONTENT_DIALOG_PANEL, alert.surface)}
    phoneLook={isAlert ? "dialog" : "drawer"}
    phoneClass={isAlert
      ? cn(CONTENT_DIALOG_PANEL, alert.surface)
      : "gap-lg rounded-ss-confirm-sheet rounded-se-confirm-sheet px-sheet-inline pbe-page-bottom max-block-dialog-limit"}
    phoneOverlayClass={alert.scrim}
    wideOverlayClass={alert.scrim}
    onDismiss={onCancel}
    onOpenAutoFocus={focusDefaultButton}
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
          "mbs-xs",
          isAlert
            ? cn("grid grid-cols-2 gap-sm", alert.actions)
            : "flex flex-col-reverse gap-sheet-buttons medium:grid medium:grid-cols-2 medium:gap-sm",
        ]}
      >
        {#each alert.actionOrder as action (action)}
          {#if action === "cancel"}
            <Button
              bind:ref={buttons.cancel}
              type="button"
              look="confirm-cancel"
              class={alert.cancel}
              onclick={onCancel}
            >
              {cancelLabel}
            </Button>
          {:else}
            <Button
              bind:ref={buttons.confirm}
              type="button"
              look="confirm-danger"
              class={cn(CONFIRM_FILLS[tone], alert.confirm)}
              aria-disabled={isBusy || undefined}
              onclick={confirm}
            >
              {confirmLabel}
            </Button>
          {/if}
        {/each}
      </div>
    </div>
  </ModalContent>
</AlertDialog.Root>
