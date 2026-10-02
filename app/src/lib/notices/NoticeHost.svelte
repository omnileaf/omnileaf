<script lang="ts">
  import NoticeCard from "./NoticeCard.svelte";
  import type { NoticeAction, Notices } from "./notices.svelte";

  let { notices }: { notices: Notices } = $props();

  const shown = $derived(notices.shown);

  function act(action: NoticeAction): void {
    notices.act(action);
  }

  function dismiss(): void {
    notices.dismiss();
  }
</script>

<div role="status">
  {#if shown?.tone === "info"}
    {#key shown}
      <NoticeCard notice={shown} onAction={act} onDismiss={dismiss} />
    {/key}
  {/if}
</div>
<div role="alert">
  {#if shown?.tone === "warning"}
    {#key shown}
      <NoticeCard notice={shown} onAction={act} onDismiss={dismiss} />
    {/key}
  {/if}
</div>
