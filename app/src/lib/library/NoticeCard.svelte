<script lang="ts">
  import { X } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { Notice, Tone } from "./notice";

  const TONES = {
    done: {
      card: "border-border bg-card text-foreground",
      tile: "bg-accent-soft",
    },
    warning: {
      card: "border-warning-edge bg-warning-soft text-on-warning",
      tile: "bg-warning",
    },
  } satisfies Record<Tone, { card: string; tile: string }>;

  const ICON_SIZE = 20;
  const DISMISS_SIZE = 18;

  let { notice, onDismiss }: { notice: Notice; onDismiss: () => void } =
    $props();
</script>

<div
  class={[
    "flex items-start gap-md rounded-card border py-md ps-md pe-sm text-start",
    TONES[notice.tone].card,
  ]}
>
  <span
    class={[
      "flex shrink-0 items-center justify-center rounded-tile block-tile inline-tile",
      TONES[notice.tone].tile,
    ]}
  >
    <notice.icon size={ICON_SIZE} />
  </span>
  <span class="flex flex-1 flex-col gap-2xs self-center wrap-anywhere">
    <span class="text-label font-bold">{notice.title}</span>
    {#if notice.body !== undefined}
      <span class="text-footnote opacity-85">{notice.body}</span>
    {/if}
  </span>
  <button
    type="button"
    aria-label={m.notice_dismiss()}
    class="-my-xs flex shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity block-touch-target inline-touch-target before:absolute before:rounded-full before:transition-control before:block-pointer-target before:inline-pointer-target hover:opacity-100 hover:before:bg-hover active:opacity-100 active:before:bg-pressed motion-safe:before:duration-fade motion-safe:before:ease-out desktop:my-none desktop:block-dismiss desktop:inline-dismiss"
    onclick={onDismiss}
  >
    <X size={DISMISS_SIZE} class="relative" />
  </button>
</div>
