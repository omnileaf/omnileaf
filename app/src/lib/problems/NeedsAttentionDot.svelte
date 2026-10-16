<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let {
    count,
    isOpen,
    onOpen,
  }: { count: number; isOpen: boolean; onOpen: () => void } = $props();
</script>

<button
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.attention_count_label({ count })}
  class={[
    "-my-md -ms-xs flex shrink-0 items-center justify-center rounded-full transition-control block-touch-target inline-touch-target",
    isOpen ? "bg-accent-soft" : "hover:tint-hover active:tint-pressed",
  ]}
  onclick={onOpen}
>
  <span
    class="rounded-full bg-accent ring-2 ring-background block-attention-dot inline-attention-dot"
  ></span>
</button>
