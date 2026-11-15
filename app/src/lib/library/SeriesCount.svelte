<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let {
    count,
    hidden = 0,
    grouping,
  }: {
    count: number;
    hidden?: number;
    grouping?: string | undefined;
  } = $props();

  const series = $derived(
    count === 0 ? m.library_no_series() : m.library_series_count({ count }),
  );
  const shown = $derived(
    hidden === 0
      ? series
      : m.library_series_and_hidden({
          series,
          hidden: m.library_hidden_count({ count: hidden }),
        }),
  );
</script>

<p
  class="text-small text-muted max-medium:text-native-collection-count/native-collection-count max-medium:font-native-collection-count max-medium:tracking-native-collection-count in-toolbar:truncate"
>
  {grouping === undefined
    ? shown
    : m.library_series_grouped({ series: shown, grouping })}
</p>
