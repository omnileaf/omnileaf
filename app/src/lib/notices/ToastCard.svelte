<script lang="ts" module>
  export const TOAST_ICON_SIZE = 20;
</script>

<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { m } from "#lib/paraglide/messages.js";

  import type { NoticeAction, NoticeTone } from "./notices";

  const DISMISS_ICON_SIZE = 16;

  const TONES = {
    plain: "border-border bg-card text-foreground",
    warning: "border-warning-edge bg-warning-soft text-on-warning",
  } satisfies Record<NoticeTone, string>;

  let {
    tone,
    icon,
    title,
    body,
    action,
    shortcut,
    children,
    onDismiss,
  }: {
    tone: NoticeTone;
    icon: Snippet;
    title: string | Snippet;
    body?: string | undefined;
    action?: NoticeAction | undefined;
    shortcut?: { readonly label: string; readonly keys: string } | undefined;
    children?: Snippet;
    onDismiss: () => void;
  } = $props();
</script>

<div
  class={[
    "flex items-center gap-md rounded-toast border py-md ps-lg pe-sm font-ui wrap-anywhere shadow-toast group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent medium:rounded-toast-wide",
    TONES[tone],
  ]}
>
  <span aria-hidden="true" class="flex shrink-0 self-start">
    {@render icon()}
  </span>
  <div class="flex flex-1 flex-col gap-2xs min-inline-none">
    <p class="text-label font-bold touch:max-medium:text-callout">
      {#if typeof title === "string"}
        {title}
      {:else}
        {@render title()}
      {/if}
    </p>
    {#if body !== undefined}
      <p class="text-footnote opacity-85">{body}</p>
    {/if}
    {@render children?.()}
  </div>
  {#if action !== undefined}
    <button
      type="button"
      aria-keyshortcuts={shortcut?.keys}
      class="shrink-0 rounded-full bg-foreground px-lg text-detail font-bold text-card transition-control min-block-touch-target hover:opacity-85 active:opacity-70 desktop:px-md desktop:min-block-compact-button"
      onclick={() => {
        onDismiss();
        action.run();
      }}
    >
      {action.label}
    </button>
  {/if}
  {#if shortcut !== undefined}
    <kbd
      aria-hidden="true"
      class="hidden shrink-0 rounded-badge border border-border bg-chip px-key-inline py-key-block font-ui text-caption font-bold text-muted desktop:inline"
    >
      {shortcut.label}
    </kbd>
  {/if}
  <button
    type="button"
    aria-label={m.notice_dismiss()}
    class="-my-sm flex shrink-0 items-center justify-center rounded-full opacity-70 transition-control block-touch-target inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover active:opacity-100 active:before:bg-pressed desktop:my-none desktop:block-dismiss desktop:inline-dismiss"
    onclick={onDismiss}
  >
    <X aria-hidden="true" size={DISMISS_ICON_SIZE} class="relative" />
  </button>
</div>
