<script lang="ts">
  import { X } from "@lucide/svelte";

  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { Notice, Tone } from "./notice";

  const TONES = {
    done: {
      card: "border-border bg-card text-foreground",
      badge: "bg-accent-soft",
    },
    warning: {
      card: "border-warning-edge bg-warning-soft text-on-warning",
      badge: "bg-warning",
    },
  } satisfies Record<Tone, { card: string; badge: string }>;

  const DISMISS_SIZE = 18;

  let { notice, onDismiss }: { notice: Notice; onDismiss: () => void } =
    $props();
</script>

<div
  class={[
    "flex flex-col gap-sm rounded-card border py-md ps-md pe-sm text-start wrap-anywhere",
    TONES[notice.tone].card,
  ]}
>
  <div class="flex items-center gap-md">
    <HeaderBadge icon={notice.icon} tone={TONES[notice.tone].badge} />
    <p class="flex-1 text-label font-bold touch:max-medium:text-callout">
      {notice.title}
    </p>
    <button
      type="button"
      aria-label={m.notice_dismiss()}
      class="-my-xs flex shrink-0 items-center justify-center rounded-full opacity-70 transition-control block-touch-target inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover active:opacity-100 active:before:bg-pressed desktop:my-none desktop:block-dismiss desktop:inline-dismiss"
      onclick={onDismiss}
    >
      <X size={DISMISS_SIZE} class="relative" />
    </button>
  </div>
  {#if notice.body !== undefined}
    <p class="text-footnote opacity-85">{notice.body}</p>
  {/if}
</div>
