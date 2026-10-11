<script lang="ts">
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";

  import MessageBar from "./MessageBar.svelte";
  import NoticeCard from "./NoticeCard.svelte";
  import type { NoticeAction, Notices } from "./notices.svelte";
  import UndoBar from "./UndoBar.svelte";
  import { isUndoPressed, undoShortcutOn } from "./undo-shortcut";

  const TEXT_FIELDS = "input, textarea, select, [contenteditable]";

  let { notices, platform }: { notices: Notices; platform: Platform } =
    $props();

  const shown = $derived(notices.shown);
  const undoOffer = $derived(notices.undoOffer);
  const message = $derived(notices.message);
  const shortcut = $derived(undoShortcutOn(platform));

  let status: HTMLElement | undefined;
  let alert: HTMLElement | undefined;
  let cameFrom: HTMLElement | undefined;

  function noteWhereFocusCameFrom(
    event: FocusEvent & { currentTarget: HTMLElement },
  ): void {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
      cameFrom = from;
    }
  }

  function isHoldingFocus(): boolean {
    const focused = document.activeElement;
    return [status, alert].some((region) => region?.contains(focused));
  }

  function returnFocus(): void {
    if (!isHoldingFocus()) {
      return;
    }
    if (cameFrom?.isConnected === true) {
      cameFrom.focus();
    } else {
      focusPageHeading();
    }
  }

  function act(action: NoticeAction): void {
    returnFocus();
    notices.act(action);
  }

  function dismiss(): void {
    returnFocus();
    notices.dismiss();
  }

  function undo(): void {
    returnFocus();
    notices.undo();
  }

  function isInTextField(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(TEXT_FIELDS) !== null;
  }

  function undoOnShortcut(event: KeyboardEvent): void {
    if (
      undoOffer === undefined ||
      isInTextField(event.target) ||
      !isUndoPressed(shortcut, event)
    ) {
      return;
    }
    event.preventDefault();
    undo();
  }
</script>

<svelte:window onkeydown={undoOnShortcut} />

<div role="status" bind:this={status} onfocusin={noteWhereFocusCameFrom}>
  {#if shown?.tone === "info"}
    {#key shown}
      <NoticeCard notice={shown} onAction={act} onDismiss={dismiss} />
    {/key}
  {:else if undoOffer !== undefined}
    {#key undoOffer}
      <UndoBar
        offer={undoOffer}
        {shortcut}
        onUndo={undo}
        onDismiss={dismiss}
        onHold={() => {
          notices.hold();
        }}
        onRelease={() => {
          notices.release();
        }}
      />
    {/key}
  {:else if message !== undefined}
    {#key message}
      <MessageBar {message} />
    {/key}
  {/if}
</div>
<div role="alert" bind:this={alert} onfocusin={noteWhereFocusCameFrom}>
  {#if shown?.tone === "warning"}
    {#key shown}
      <NoticeCard notice={shown} onAction={act} onDismiss={dismiss} />
    {/key}
  {/if}
</div>
