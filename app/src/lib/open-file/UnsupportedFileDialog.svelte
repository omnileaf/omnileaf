<script lang="ts">
  import { FileX } from "@lucide/svelte";

  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();
</script>

<ConfirmDialog
  {isOpen}
  icon={FileX}
  tone="accent"
  title={m.reader_unsupported_title()}
  confirmLabel={m.reader_unsupported_dismiss()}
  phoneLook="dialog"
  onConfirm={onClose}
  onCancel={onClose}
>
  <p>{m.reader_unsupported_body_types()}</p>
</ConfirmDialog>
