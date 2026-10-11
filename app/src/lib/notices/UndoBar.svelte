<script lang="ts">
  import { X } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import type { UndoOffer } from "./notices.svelte";
  import { TOAST_BAR } from "./toast-bar";
  import type { UndoShortcut } from "./undo-shortcut";

  const DISMISS_ICON_SIZE = 16;

  let {
    offer,
    shortcut,
    onUndo,
    onDismiss,
    onHold,
    onRelease,
  }: {
    offer: UndoOffer;
    shortcut: UndoShortcut;
    onUndo: () => void;
    onDismiss: () => void;
    onHold: () => void;
    onRelease: () => void;
  } = $props();
</script>

<div
  class={[TOAST_BAR, "p-sm ps-lg"]}
  onfocusin={onHold}
  onfocusout={onRelease}
>
  <p class="grow text-label">{offer.message}</p>
  <button
    type="button"
    aria-keyshortcuts={shortcut.keys}
    class="shrink-0 rounded-control bg-toast-action px-lg text-label font-bold text-on-toast-action transition-control min-block-touch-target hover:bg-toast-action-hover active:bg-toast-action-pressed"
    onclick={onUndo}
  >
    {m.undo_action()}
  </button>
  <kbd
    aria-hidden="true"
    class="hidden shrink-0 rounded-badge bg-toast-key px-sm font-ui text-caption font-bold text-toast-muted medium:block"
  >
    {shortcut.label()}
  </kbd>
  <button
    type="button"
    aria-label={m.notice_dismiss()}
    class="hidden shrink-0 items-center justify-center rounded-full text-toast-muted transition-control min-block-touch-target min-inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:text-on-toast hover:before:bg-toast-hover active:text-on-toast active:before:bg-toast-pressed medium:flex"
    onclick={onDismiss}
  >
    <X aria-hidden="true" size={DISMISS_ICON_SIZE} class="relative" />
  </button>
</div>
