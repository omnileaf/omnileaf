<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";

  const CLOSE_ICON_SIZE = 20;

  let {
    title,
    closeLabel,
    actionLabel,
    isActionPrimary = false,
    onClose,
    onAction,
  }: {
    title: string;
    closeLabel: string;
    actionLabel?: string;
    isActionPrimary?: boolean;
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
  <DialogTitle
    class="col-start-2 row-start-1 text-center text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title text-balance wrap-anywhere"
  >
    {title}
  </DialogTitle>
  {#if actionLabel !== undefined}
    <Button
      type="button"
      look="header-control"
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
