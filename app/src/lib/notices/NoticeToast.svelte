<script lang="ts">
  import type { Notice, NoticeTone, ToastHandle } from "./notices";
  import ToastCard, { TOAST_ICON_SIZE } from "./ToastCard.svelte";

  const ICON_TONES = {
    plain: "text-accent",
    warning: "text-warning-strong",
  } satisfies Record<NoticeTone, string>;

  let { notice, toast }: { notice: Notice; toast: ToastHandle } = $props();
</script>

<ToastCard
  tone={notice.tone}
  title={notice.title}
  body={notice.body}
  action={notice.action}
  onDismiss={toast.dismiss}
>
  {#snippet icon()}
    <notice.icon size={TOAST_ICON_SIZE} class={ICON_TONES[notice.tone]} />
  {/snippet}
</ToastCard>
