<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import type { Notice, NoticeTone, ToastHandle } from "./notices";
  import ToastCard, { TOAST_ICON_SIZE } from "./ToastCard.svelte";
  import { toastLook } from "./toast-look";

  const ICON_TONES = {
    plain: "text-accent android:text-android-inverse-primary",
    warning: "text-warning-strong",
  } satisfies Record<NoticeTone, string>;

  let { notice, toast }: { notice: Notice; toast: ToastHandle } = $props();

  const look = toastLook(currentPlatform());

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
      class={look.warningAction}
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
