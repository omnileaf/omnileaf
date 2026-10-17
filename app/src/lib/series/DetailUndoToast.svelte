<script lang="ts">
  import { Undo2 } from "@lucide/svelte";

  import { UNDO_WINDOW_MS, type UndoOffer } from "#lib/notices/notices.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let { offer, onDone }: { offer: UndoOffer | undefined; onDone: () => void } =
    $props();

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

<div
  role="status"
  class="pointer-events-none sticky inset-be-md flex justify-end pbs-md"
>
  {#if offer !== undefined}
    <div class="pointer-events-auto">
      <ToastCard
        tone="plain"
        title={offer.title}
        action={{ label: m.undo_action(), run: undo }}
        onDismiss={onDone}
      >
        {#snippet icon()}
          <Undo2 size={TOAST_ICON_SIZE} class="text-muted" />
        {/snippet}
      </ToastCard>
    </div>
  {/if}
</div>
