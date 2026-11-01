<script lang="ts">
  import { Undo2 } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    SHEET_FIELD_HEAD,
    SHEET_FIELD_HEADING,
    SHEET_FIELD_STATUS,
    SHEET_FIELD_UNDO_ICON_SIZE,
  } from "./sheet-field-look.ts";

  const ICON_SIZE = 16;
  const MACOS_UNDO_ICON_SIZE = 13;
  const ROW = "flex items-center gap-sm min-block-field-head";
  const LABEL = "flex-1 text-label font-medium";
  const UNDO =
    "flex items-center justify-center rounded-full text-accent transition-control block-pointer-button inline-pointer-button hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent active:bg-pressed touch:block-touch-target touch:inline-touch-target";
  const MACOS_LABEL =
    "col-start-1 row-start-1 text-end text-native-button leading-native-button font-native-button text-foreground";
  const MACOS_LABEL_ONE_LINE = "pbs-xs";
  const MACOS_LABEL_TALL = "pbs-native-detail-label-tall";
  const MACOS_END =
    "col-start-3 row-start-1 flex items-center justify-end gap-xs min-block-native-button";
  const MACOS_UNDO = variantClasses("plain", "regular", true, "macos");

  let {
    label,
    labelFor,
    labelId,
    isEdited,
    isAndroid = false,
    isSheet = false,
    isMacos = false,
    isTallField = false,
    useFileLabel,
    onUseFile,
  }: {
    label: string;
    labelFor?: string;
    labelId?: string;
    isEdited: boolean;
    isAndroid?: boolean;
    isSheet?: boolean;
    isMacos?: boolean;
    isTallField?: boolean;
    useFileLabel: string;
    onUseFile: () => void;
  } = $props();

  const macosLabel = $derived(
    cn(MACOS_LABEL, isTallField ? MACOS_LABEL_TALL : MACOS_LABEL_ONE_LINE),
  );
</script>

<div class={isSheet ? SHEET_FIELD_HEAD : isMacos ? "contents" : ROW}>
  {#if labelFor === undefined}
    <svelte:element
      this={isSheet ? "h3" : "p"}
      id={labelId}
      class={isSheet ? SHEET_FIELD_HEADING : isMacos ? macosLabel : LABEL}
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
    <label for={labelFor} class={isMacos ? macosLabel : LABEL}>{label}</label>
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
    <div class={isMacos ? MACOS_END : "contents"}>
      <Badge look={isMacos ? "status" : "secondary"}>
        {m.edit_details_edited()}
      </Badge>
      <Tooltip
        label={useFileLabel}
        side="bottom"
        type="button"
        aria-label={useFileLabel}
        class={isMacos ? MACOS_UNDO : UNDO}
        onclick={onUseFile}
      >
        <Undo2
          size={isMacos ? MACOS_UNDO_ICON_SIZE : ICON_SIZE}
          aria-hidden="true"
        />
      </Tooltip>
    </div>
  {/if}
</div>
