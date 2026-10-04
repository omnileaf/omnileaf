<script lang="ts">
  import { X } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { Notice, NoticeAction, NoticeTone } from "./notices.svelte";

  const ICON_SIZE = 20;
  const DISMISS_ICON_SIZE = 16;

  const TONES = {
    info: {
      card: "border-border bg-card text-foreground",
      icon: "bg-accent-soft",
    },
    warning: {
      card: "border-warning-edge bg-warning-soft text-on-warning",
      icon: "bg-warning",
    },
  } satisfies Record<NoticeTone, { card: string; icon: string }>;

  const EMPHASES = {
    primary: "bg-accent text-on-accent",
    quiet: "border border-current/35",
  } satisfies Record<NoticeAction["emphasis"], string>;

  let {
    notice,
    onAction,
    onDismiss,
  }: {
    notice: Notice;
    onAction: (action: NoticeAction) => void;
    onDismiss: () => void;
  } = $props();

  const tone = $derived(TONES[notice.tone]);
</script>

<div
  class={[
    "absolute inset-x-md inset-be-md flex flex-col gap-sm rounded-notice p-md shadow-notice motion-safe:animate-notice-rise medium:fixed medium:inset-s-auto medium:inset-e-notice-end medium:inset-be-page-bottom medium:rounded-panel medium:border medium:shadow-notice-wide medium:inline-notice ios:max-medium:inset-be-floating-clearance",
    tone.card,
  ]}
>
  <div class="flex items-start gap-md">
    <span
      class={[
        "flex shrink-0 items-center justify-center rounded-control p-sm",
        tone.icon,
      ]}
    >
      <notice.icon aria-hidden="true" size={ICON_SIZE} />
    </span>
    <p class="flex grow flex-col gap-2xs">
      <span class="font-bold">{notice.title}</span>
      <span class="text-label opacity-85">{notice.body}</span>
    </p>
    <button
      type="button"
      aria-label={m.notice_dismiss()}
      class="-me-sm -mbs-sm flex shrink-0 items-center justify-center rounded-full opacity-70 min-block-touch-target min-inline-touch-target"
      onclick={onDismiss}
    >
      <X aria-hidden="true" size={DISMISS_ICON_SIZE} />
    </button>
  </div>
  {#if notice.actions.length > 0}
    <div class="flex flex-wrap justify-end gap-sm">
      {#each notice.actions as action (action.label)}
        <button
          type="button"
          class={[
            "rounded-full px-lg text-label font-bold min-block-touch-target medium:rounded-control",
            EMPHASES[action.emphasis],
          ]}
          onclick={() => {
            onAction(action);
          }}
        >
          {action.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
