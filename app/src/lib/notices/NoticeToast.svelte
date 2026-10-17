<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";

  import type { Notice, NoticeTone, ToastHandle } from "./notices";
  import ToastCard, {
    TOAST_ICON_SIZE,
    WARNING_ACTION,
  } from "./ToastCard.svelte";

  const ICON_TONES = {
    plain: "text-accent",
    warning: "text-warning-strong",
  } satisfies Record<NoticeTone, string>;

  let { notice, toast }: { notice: Notice; toast: ToastHandle } = $props();

  const actionUnderWords = $derived(
    notice.tone === "warning" ? notice.action : undefined,
  );
</script>

{#snippet underWords()}
  {#if actionUnderWords !== undefined}
    {@const action = actionUnderWords}
    <Button
      type="button"
      look="inverse"
      class={WARNING_ACTION}
      onclick={() => {
        toast.dismiss();
        action.run();
      }}
    >
      {action.label}
    </Button>
  {/if}
{/snippet}

<ToastCard
  tone={notice.tone}
  title={notice.title}
  body={notice.body}
  action={actionUnderWords === undefined ? notice.action : undefined}
  actions={actionUnderWords === undefined ? undefined : underWords}
  onDismiss={toast.dismiss}
>
  {#snippet icon()}
    <notice.icon size={TOAST_ICON_SIZE} class={ICON_TONES[notice.tone]} />
  {/snippet}
</ToastCard>
