<script lang="ts">
  import { Info, Power } from "@lucide/svelte";

  import AppIcon from "#lib/first-launch/AppIcon.svelte";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const NOTE_ICON_SIZE = 16;

  let {
    isOpen,
    version,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    version: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();
</script>

<ConfirmDialog
  {isOpen}
  icon={Power}
  title={m.crash_test_quit_title()}
  confirmLabel={m.crash_test_quit_confirm()}
  cancelLabel={m.crash_test_quit_cancel()}
  {onConfirm}
  {onCancel}
>
  <div class="flex items-center gap-md rounded-card bg-well px-list-row py-md">
    <AppIcon class="shrink-0 block-icon-tile inline-icon-tile" />
    <div class="flex flex-col min-inline-none">
      <p class="truncate text-callout font-semibold max-medium:text-body">
        {m.app_name()}
      </p>
      <p class="text-footnote wrap-break-word text-muted">
        {m.crash_test_quit_build({ version })}
      </p>
    </div>
  </div>
  <p
    class="flex items-start gap-sm text-footnote text-muted max-medium:text-label"
  >
    <Info size={NOTE_ICON_SIZE} aria-hidden="true" class="mbs-2xs shrink-0" />
    <span>{m.crash_test_quit_note()}</span>
  </p>
</ConfirmDialog>
