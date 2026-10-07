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
    primary:
      "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed",
    quiet: "border border-current/35 hover:bg-hover active:bg-pressed",
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
      <span class="text-callout font-bold desktop:text-label"
        >{notice.title}</span
      >
      <span class="text-detail opacity-85">{notice.body}</span>
    </p>
    <button
      type="button"
      aria-label={m.notice_dismiss()}
      class="-me-sm -mbs-sm flex shrink-0 items-center justify-center rounded-full opacity-70 transition-control min-block-touch-target min-inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover active:opacity-100 active:before:bg-pressed"
      onclick={onDismiss}
    >
      <X aria-hidden="true" size={DISMISS_ICON_SIZE} class="relative" />
    </button>
  </div>
  {#if notice.actions.length > 0}
    <div class="flex flex-wrap justify-end gap-sm">
      {#each notice.actions as action (action.label)}
        <button
          type="button"
          class={[
            "rounded-full px-lg text-detail font-bold transition-control min-block-touch-target medium:rounded-control desktop:rounded-control desktop:px-md desktop:min-block-compact-button",
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
