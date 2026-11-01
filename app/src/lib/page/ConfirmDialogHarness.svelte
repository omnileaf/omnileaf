<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import type { IosPhoneConfirmLook } from "#lib/components/ui/dialog/alert-look.ts";

  import ConfirmDialog from "./ConfirmDialog.svelte";

  let {
    phoneLook = "sheet",
    tone = "danger",
    isBusy = false,
    iosPhoneLook,
  }: {
    phoneLook?: "sheet" | "dialog";
    tone?: "danger" | "accent";
    isBusy?: boolean;
    iosPhoneLook?: IosPhoneConfirmLook | undefined;
  } = $props();
</script>

<ConfirmDialog
  isOpen
  icon={Trash}
  title="Delete downloads?"
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={() => {}}
  onCancel={() => {}}
  {phoneLook}
  {tone}
  {isBusy}
  {iosPhoneLook}
>
  <p>This removes 1.2 GB. Your library and progress stay.</p>
</ConfirmDialog>
