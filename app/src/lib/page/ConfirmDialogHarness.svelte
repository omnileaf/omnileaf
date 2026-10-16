<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import ConfirmDialog from "./ConfirmDialog.svelte";
</script>

<ConfirmDialog
  isOpen
  icon={Trash}
  title="Delete downloads?"
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={() => {}}
  onCancel={() => {}}
>
  <p>This removes 1.2 GB. Your library and progress stay.</p>
</ConfirmDialog>
