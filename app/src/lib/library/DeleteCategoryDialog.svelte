<script lang="ts" module>
  export interface DeletedCategory {
    readonly name: string;
    readonly seriesCount: number | undefined;
  }
</script>

<script lang="ts">
  import { Trash } from "@lucide/svelte";

  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    category,
    isBusy,
    onDelete,
    onCancel,
    onCloseAutoFocus,
  }: {
    category: DeletedCategory | undefined;
    isBusy: boolean;
    onDelete: () => void;
    onCancel: () => void;
    onCloseAutoFocus: (event: Event) => void;
  } = $props();

  const shown = lastShown(() => category);
  const name = $derived(shown.current?.name ?? "");
  const seriesCount = $derived(shown.current?.seriesCount ?? 0);
</script>

<ConfirmDialog
  isOpen={category !== undefined}
  icon={Trash}
  title={m.library_tabs_delete_title({ tab: name })}
  confirmLabel={m.library_tabs_delete()}
  cancelLabel={m.library_cancel()}
  {isBusy}
  iosPhoneLook="actionSheet"
  androidPhoneLook="iconDialog"
  macLook="alert"
  onConfirm={onDelete}
  {onCancel}
  {onCloseAutoFocus}
>
  <p>
    {seriesCount > 0
      ? m.library_tabs_delete_kept({ count: seriesCount })
      : m.library_tabs_delete_kept_uncounted()}
  </p>
</ConfirmDialog>
