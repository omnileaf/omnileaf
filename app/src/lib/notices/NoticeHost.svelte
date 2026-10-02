<script lang="ts">
  import { focusPageHeading } from "$lib/navigation/page-heading";

  import NoticeCard from "./NoticeCard.svelte";
  import type { NoticeAction, Notices } from "./notices.svelte";

  let { notices }: { notices: Notices } = $props();

  const shown = $derived(notices.shown);

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
</script>

<div role="status" bind:this={status} onfocusin={noteWhereFocusCameFrom}>
  {#if shown?.tone === "info"}
    {#key shown}
      <NoticeCard notice={shown} onAction={act} onDismiss={dismiss} />
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
