<script lang="ts">
  import { Undo2 } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    SHEET_FIELD_HEAD,
    SHEET_FIELD_HEADING,
    SHEET_FIELD_STATUS,
    SHEET_FIELD_UNDO_ICON_SIZE,
  } from "./sheet-field-look.ts";

  const ICON_SIZE = 16;

  let {
    label,
    labelFor,
    labelId,
    isEdited,
    isAndroid = false,
    isSheet = false,
    useFileLabel,
    onUseFile,
  }: {
    label: string;
    labelFor?: string;
    labelId?: string;
    isEdited: boolean;
    isAndroid?: boolean;
    isSheet?: boolean;
    useFileLabel: string;
    onUseFile: () => void;
  } = $props();
</script>

<div
  class={isSheet
    ? SHEET_FIELD_HEAD
    : "flex items-center gap-sm min-block-field-head"}
>
  {#if labelFor === undefined}
    <svelte:element
      this={isSheet ? "h3" : "p"}
      id={labelId}
      class={isSheet ? SHEET_FIELD_HEADING : "flex-1 text-label font-medium"}
    >
      {label}
    </svelte:element>
  {:else if isAndroid}
    <span class="flex-1"></span>
  {:else if isSheet}
    <h3 class={SHEET_FIELD_HEADING}>
      <label for={labelFor}>{label}</label>
    </h3>
  {:else}
    <label for={labelFor} class="flex-1 text-label font-medium">{label}</label>
  {/if}
  {#if isEdited && isSheet}
    <span class={SHEET_FIELD_STATUS}>{m.edit_details_edited()}</span>
    <Button
      type="button"
      variant="plain"
      iconOnly
      label={useFileLabel}
      onclick={onUseFile}
    >
      <Undo2 size={SHEET_FIELD_UNDO_ICON_SIZE} aria-hidden="true" />
    </Button>
  {:else if isEdited}
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
