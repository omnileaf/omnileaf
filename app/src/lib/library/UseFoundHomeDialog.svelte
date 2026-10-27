<script lang="ts">
  import { Library } from "@lucide/svelte";

  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import FolderWell from "./FolderWell.svelte";
  import type { FoundHome } from "./home-folder-change.svelte";

  let {
    found,
    isBusy,
    onUse,
    onCancel,
  }: {
    found: FoundHome | undefined;
    isBusy: boolean;
    onUse: () => void;
    onCancel: () => void;
  } = $props();

  const shown = lastShown(() => found);

  function detailOf({ library }: FoundHome): string {
    const { series, books, lastBackupAtMs } = library;
    if (lastBackupAtMs === null) {
      return m.home_use_found_detail({ series, books });
    }
    const date = new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "long",
    }).format(lastBackupAtMs);
    return m.home_use_found_detail_backed_up({ series, books, date });
  }
</script>

<ConfirmDialog
  isOpen={found !== undefined}
  icon={Library}
  tone="accent"
  {isBusy}
  title={m.home_use_found_title()}
  confirmLabel={m.home_use_found_confirm()}
  cancelLabel={m.home_use_found_cancel()}
  onConfirm={onUse}
  {onCancel}
>
  {#if shown.current !== undefined}
    <FolderWell
      title={shown.current.location}
      detail={detailOf(shown.current)}
    />
    <p class="text-footnote text-muted max-medium:text-label">
      {m.home_use_found_body()}
    </p>
  {/if}
</ConfirmDialog>
