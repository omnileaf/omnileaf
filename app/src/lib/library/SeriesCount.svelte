<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let { count }: { count: number } = $props();

  const number = $derived(new Intl.NumberFormat(getLocale()).format(count));
</script>

<p class="text-count font-semibold text-muted large:text-body">
  <span aria-hidden="true">{number}</span>
  <span class="sr-only">{m.library_series_count({ count })}</span>
</p>
