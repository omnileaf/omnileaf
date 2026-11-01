<script lang="ts">
  import { X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";

  const CLOSE_ICON_SIZE = 20;

  let {
    title,
    titleId,
    description,
    closeLabel,
    actionLabel,
    isActionPrimary = false,
    isActionDisabled = false,
    onClose,
    onAction,
  }: {
    title: string;
    titleId?: string;
    description?: string;
    closeLabel: string;
    actionLabel?: string;
    isActionPrimary?: boolean;
    isActionDisabled?: boolean;
    onClose: () => void;
    onAction?: () => void;
  } = $props();
</script>

<div class="grid grid-cols-sheet-header items-center gap-sm px-lg py-md">
  <Button
    type="button"
    look="header-control"
    iconOnly
    label={closeLabel}
    class="col-start-1 row-start-1 justify-self-start ios:backdrop-blur-none"
    onclick={onClose}
  >
    <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
  </Button>
  <div class="col-start-2 row-start-1 flex flex-col items-center text-center">
    <DialogTitle
      {...titleId === undefined ? {} : { id: titleId }}
      class="text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-balance wrap-anywhere"
    >
      {title}
    </DialogTitle>
    {#if description !== undefined}
      <Dialog.Description
        class="text-native-group-footer/native-group-footer text-muted"
      >
        {description}
      </Dialog.Description>
    {/if}
  </div>
  {#if actionLabel !== undefined}
    <Button
      type="button"
      look="header-control"
      disabled={isActionDisabled}
      class={[
        "col-start-3 row-start-1 justify-self-end px-md ios:backdrop-blur-none",
        isActionPrimary &&
          "bg-native-button-primary text-native-on-button-primary shadow-none",
      ]}
      onclick={onAction}
    >
      {actionLabel}
    </Button>
  {/if}
</div>
