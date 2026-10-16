<script lang="ts">
  import { Undo2 } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let {
    label,
    labelFor,
    labelId,
    isEdited,
    useFileLabel,
    onUseFile,
  }: {
    label: string;
    labelFor?: string;
    labelId?: string;
    isEdited: boolean;
    useFileLabel: string;
    onUseFile: () => void;
  } = $props();
</script>

<div class="flex items-center gap-sm min-block-field-head">
  {#if labelFor === undefined}
    <p id={labelId} class="flex-1 text-label font-medium">{label}</p>
  {:else}
    <label for={labelFor} class="flex-1 text-label font-medium">{label}</label>
  {/if}
  {#if isEdited}
    <Badge look="secondary">{m.edit_details_edited()}</Badge>
    <Tooltip
      label={useFileLabel}
      side="bottom"
      type="button"
      aria-label={useFileLabel}
      class="flex items-center justify-center rounded-full text-accent transition-control block-pointer-button inline-pointer-button hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent active:bg-pressed touch:block-touch-target touch:inline-touch-target"
      onclick={onUseFile}
    >
      <Undo2 size={ICON_SIZE} aria-hidden="true" />
    </Tooltip>
  {/if}
</div>
