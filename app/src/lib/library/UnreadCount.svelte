<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    count,
    isSpelledOut = false,
    class: className,
  }: { count: number; isSpelledOut?: boolean; class?: ClassValue } = $props();

  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

{#if count > 0}
  <Badge
    look="count"
    role="img"
    aria-label={m.library_unread_count({ count })}
    class={className}
  >
    {isSpelledOut ? m.library_unread_count({ count }) : numbers.format(count)}
  </Badge>
{/if}
