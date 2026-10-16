<script lang="ts">
  import { Folder } from "@lucide/svelte";
  import { AlertDialog } from "bits-ui";

  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import StepButton from "./StepButton.svelte";

  let {
    isOpen,
    onContinue,
    onNotNow,
  }: {
    isOpen: boolean;
    onContinue: () => void;
    onNotNow: () => void;
  } = $props();
</script>

<AlertDialog.Root
  bind:open={
    () => isOpen,
    (open: boolean) => {
      if (!open) {
        onNotNow();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col gap-lg overflow-hidden rounded-panel border border-dialog-edge bg-card p-sheet-inline text-foreground fade-motion shadow-dialog block-fit inline-dialog max-block-dialog-limit max-inline-dialog-limit"
    phoneClass="gap-lg rounded-ss-confirm-sheet rounded-se-confirm-sheet px-sheet-inline pbe-page-bottom max-block-dialog-limit"
    onDismiss={onNotNow}
  >
    <div class="flex items-center gap-md">
      <HeaderBadge icon={Folder} look="header-accent" />
      <DialogTitle
        class="text-dialog-title font-bold max-medium:text-sheet-title"
      >
        {m.first_launch_pick_folder_title()}
      </DialogTitle>
    </div>
    <AlertDialog.Description class="text-dialog-body text-muted">
      {m.first_launch_pick_folder_body()}
    </AlertDialog.Description>
    <div class="flex flex-col gap-xs">
      <StepButton kind="primary" onclick={onContinue}>
        {m.first_launch_continue()}
      </StepButton>
      <StepButton kind="quiet" onclick={onNotNow}>
        {m.first_launch_not_now()}
      </StepButton>
    </div>
  </ModalContent>
</AlertDialog.Root>
