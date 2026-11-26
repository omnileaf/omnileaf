<script lang="ts">
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const SPINNER_SIZE = 20;

  let { page }: { page: number | undefined } = $props();
</script>

<Spinner size={SPINNER_SIZE} class="text-muted" />
{#if page !== undefined}
  <p class="text-small text-muted">
    {m.reader_page_loading({ page })}
  </p>
{/if}
