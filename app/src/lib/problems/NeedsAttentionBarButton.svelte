<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  const ICON_SIZE = 20;
  const COUNT_BADGE =
    "absolute -inset-e-native-bar-badge-offset -inset-bs-native-bar-badge-offset inline-flex items-center justify-center rounded-full bg-native-bar-badge px-native-bar-badge-inline text-caption font-native-bar-badge text-native-on-bar-badge tabular-nums block-native-bar-badge min-inline-native-bar-badge";

  let {
    count,
    isOpen,
    onOpen,
  }: { count: number; isOpen: boolean; onOpen: () => void } = $props();

  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

<Button
  look="bar-button"
  iconOnly
  label={m.attention_count_label({ count })}
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  class="relative text-on-warning aria-expanded:opacity-50"
  onclick={onOpen}
>
  <TriangleAlert aria-hidden="true" size={ICON_SIZE} />
  <Badge look="count" aria-hidden="true" class={COUNT_BADGE}>
    {numbers.format(count)}
  </Badge>
</Button>
