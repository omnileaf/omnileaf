<script lang="ts">
  import { Eraser } from "@lucide/svelte";

  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { ChangedField } from "./detail-edits.ts";
  import { changedWording } from "./detail-wording.ts";
  import type { EditedSeries } from "./edited-series.ts";

  let {
    isOpen,
    series,
    changed,
    coverUrl,
    onDiscard,
    onKeepEditing,
  }: {
    isOpen: boolean;
    series: EditedSeries;
    changed: readonly ChangedField[];
    coverUrl: CoverUrl;
    onDiscard: () => void;
    onKeepEditing: () => void;
  } = $props();
</script>

<ConfirmDialog
  {isOpen}
  icon={Eraser}
  title={m.edit_details_discard_title()}
  confirmLabel={m.edit_details_discard()}
  cancelLabel={m.edit_details_keep_editing()}
  onConfirm={onDiscard}
  onCancel={onKeepEditing}
  phoneLook="dialog"
>
  <span class="flex items-center gap-md rounded-card bg-well p-md">
    <span
      class="relative aspect-cover shrink-0 overflow-hidden rounded-list-cover bg-chip inline-confirm-cover"
    >
      <CoverImage cover={series.cover} {coverUrl} />
    </span>
    <span class="flex flex-col min-inline-none">
      <span class="truncate text-callout font-semibold max-medium:text-body">
        {series.title}
      </span>
      <span class="text-footnote text-muted">{changedWording(changed)}</span>
    </span>
  </span>
  <span class="text-label text-muted max-medium:text-body">
    {m.edit_details_discard_note()}
  </span>
</ConfirmDialog>
