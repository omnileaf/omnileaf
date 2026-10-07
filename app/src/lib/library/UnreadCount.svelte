<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  let { count, class: className }: { count: number; class?: ClassValue } =
    $props();

  const numbers = $derived(new Intl.NumberFormat(getLocale()));
</script>

{#if count > 0}
  <span
    role="img"
    aria-label={m.library_unread_count({ count })}
    class={["bg-accent font-bold text-on-accent", className]}
  >
    {numbers.format(count)}
  </span>
{/if}
