<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import ConfirmDialog from "./ConfirmDialog.svelte";

  let { phoneLook = "sheet" }: { phoneLook?: "sheet" | "dialog" } = $props();
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
>
  <p>This removes 1.2 GB. Your library and progress stay.</p>
</ConfirmDialog>
