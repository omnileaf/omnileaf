<script lang="ts">
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import type { ToastHandle } from "#lib/notices/notices.ts";
  import ToastCard, { TOAST_ICON_SIZE } from "#lib/notices/ToastCard.svelte";
  import { m } from "#lib/paraglide/messages.js";

  let { toast }: { toast: ToastHandle } = $props();

  const id = $props.id();
  const titleId = `${id}-title`;
</script>

<ToastCard tone="plain" title={openingTitle} onDismiss={toast.dismiss}>
  {#snippet icon()}
    <Spinner
      size={TOAST_ICON_SIZE}
      class="text-accent android:text-android-inverse-primary"
    />
  {/snippet}
  <Progress
    aria-labelledby={titleId}
    value={null}
    class="mbs-xs block-progress-compact"
  />
</ToastCard>

{#snippet openingTitle()}
  <span id={titleId}>{m.reader_opening_handed()}</span>
{/snippet}
