<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let { count }: { count: number } = $props();
</script>

<p class="text-small text-muted">{m.library_series_count({ count })}</p>
