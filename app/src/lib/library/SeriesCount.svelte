<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let { count, hidden = 0 }: { count: number; hidden?: number } = $props();

  const series = $derived(
    count === 0 ? m.library_no_series() : m.library_series_count({ count }),
  );
</script>

<p
  class="text-small text-muted max-medium:text-native-collection-count/native-collection-count max-medium:font-native-collection-count max-medium:tracking-native-collection-count in-toolbar:truncate"
>
  {hidden === 0
    ? series
    : m.library_series_and_hidden({
        series,
        hidden: m.library_hidden_count({ count: hidden }),
      })}
</p>
