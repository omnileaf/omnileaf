<script lang="ts" module>
  export const TOAST_ICON_SIZE = 20;
</script>

<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
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
    actions,
    onDismiss,
  }: {
    tone: NoticeTone;
    icon: Snippet;
    title: string | Snippet;
    body?: string | undefined;
    action?: NoticeAction | undefined;
    shortcut?: { readonly label: string; readonly keys: string } | undefined;
    children?: Snippet;
    actions?: Snippet;
    onDismiss: () => void;
  } = $props();
</script>

<div
  class={[
    "flex gap-md rounded-toast border py-md ps-lg pe-sm font-ui wrap-anywhere shadow-toast group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent medium:rounded-toast-wide",
    actions === undefined ? "items-center" : "flex-wrap items-start",
    TONES[tone],
  ]}
>
  <div class="flex flex-1 items-start gap-md min-inline-none">
    <span
      aria-hidden="true"
      class="flex shrink-0 items-center text-label block-lh touch:max-medium:text-callout"
    >
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
  </div>
  {#if action !== undefined}
    <Button
      type="button"
      look="inverse"
      aria-keyshortcuts={shortcut?.keys}
      class="px-lg text-detail max-inline-3/5 min-block-touch-target desktop:px-md desktop:min-block-compact-button"
      onclick={() => {
        onDismiss();
        action.run();
      }}
    >
      {action.label}
    </Button>
  {/if}
  {#if shortcut !== undefined}
    <Kbd aria-hidden="true" class="hidden desktop:inline">
      {shortcut.label}
    </Kbd>
  {/if}
  <Tooltip
    label={m.notice_dismiss()}
    aria-label={m.notice_dismiss()}
    onclick={onDismiss}
  >
    {#snippet child({ props })}
      <Button
        {...props}
        look="dismiss"
        class="-my-sm shrink-0 block-touch-target inline-touch-target before:block-pointer-target before:inline-pointer-target desktop:my-none desktop:block-dismiss desktop:inline-dismiss"
      >
        <X aria-hidden="true" size={DISMISS_ICON_SIZE} class="relative" />
      </Button>
    {/snippet}
  </Tooltip>
  {#if actions !== undefined}
    <div class="flex basis-full flex-wrap justify-end gap-sm pe-sm">
      {@render actions()}
    </div>
  {/if}
</div>
