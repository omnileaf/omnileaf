<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let { count }: { count: number } = $props();
</script>

<p class="text-small text-muted in-toolbar:truncate">{m.library_series_count({ count })}</p>
