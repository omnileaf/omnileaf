<script lang="ts">
  import { Undo2 } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { UNDO_WINDOW_MS, type UndoOffer } from "#lib/notices/notices.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    offer,
    isOverBar = false,
    onDone,
  }: {
    offer: UndoOffer | undefined;
    isOverBar?: boolean;
    onDone: () => void;
  } = $props();

  const undoIcon: Snippet = icon;
  let offeredUndo: (() => void) | undefined;

  $effect(() => {
    if (offer === undefined) {
      return undefined;
    }
    offeredUndo = offer.undo;
    const lapse = setTimeout(onDone, UNDO_WINDOW_MS);
    return () => {
      clearTimeout(lapse);
    };
  });

  function undo(): void {
    offeredUndo?.();
    offeredUndo = undefined;
  }
</script>

{#snippet icon()}
  <Undo2 size={TOAST_ICON_SIZE} class="text-muted" />
{/snippet}

<div
  role="status"
  class={isOverBar
    ? "pointer-events-none absolute inset-x-sm inset-bs-native-sheet-notice-top z-10 flex"
    : "pointer-events-none sticky inset-be-md flex justify-end pbs-md"}
>
  {#if offer !== undefined}
    <div class={["pointer-events-auto", isOverBar && "flex-1"]}>
      <ToastCard
        tone="plain"
        severity="success"
        icon={isOverBar ? undefined : undoIcon}
        title={offer.title}
        action={{ label: m.undo_action(), run: undo }}
        isDismissable={!isOverBar}
        onDismiss={onDone}
      />
    </div>
  {/if}
</div>
