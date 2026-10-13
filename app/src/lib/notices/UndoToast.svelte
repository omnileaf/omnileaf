<script lang="ts">
  import { Undo2 } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import type { ToastHandle, UndoOffer } from "./notices";
  import ToastCard, { TOAST_ICON_SIZE } from "./ToastCard.svelte";
  import { getUndoShortcut } from "./undo-shortcut";

  let { offer, toast }: { offer: UndoOffer; toast: ToastHandle } = $props();

  const shortcut = getUndoShortcut();
</script>

<ToastCard
  tone="plain"
  title={offer.title}
  body={offer.body}
  action={{ label: m.undo_action(), run: offer.undo }}
  shortcut={{ label: shortcut.label(), keys: shortcut.keys }}
  onDismiss={toast.dismiss}
>
  {#snippet icon()}
    <Undo2 size={TOAST_ICON_SIZE} class="text-muted" />
  {/snippet}
</ToastCard>
