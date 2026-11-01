<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { attentionLook } from "./attention-look.ts";

  const ICON_SIZE = 16;

  let {
    count,
    isOpen,
    onOpen,
  }: { count: number; isOpen: boolean; onOpen: () => void } = $props();

  const look = attentionLook(currentPlatform());
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

{#if look.hasFoldedDot}
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
{:else}
  <Button
    variant="plain"
    iconOnly
    label={m.attention_count_label({ count })}
    aria-haspopup="dialog"
    aria-expanded={isOpen}
    class="relative shrink-0"
    onclick={onOpen}
  >
    <TriangleAlert aria-hidden="true" size={ICON_SIZE} />
    <Badge
      look="count"
      aria-hidden="true"
      class={["absolute -inset-e-xs -inset-bs-xs", look.badge]}
    >
      {numbers.format(count)}
    </Badge>
  </Button>
{/if}
