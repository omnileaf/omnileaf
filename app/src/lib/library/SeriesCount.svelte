<script lang="ts">
  import type { LibraryGrouping } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const NAMED_GROUPINGS: Partial<
    Record<LibraryGrouping, (inputs: { series: string }) => string>
  > = {
    creator: m.library_series_by_creator,
  };

  let {
    count,
    hidden = 0,
    groupBy = "none",
  }: {
    count: number;
    hidden?: number;
    groupBy?: LibraryGrouping;
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
  {NAMED_GROUPINGS[groupBy]?.({ series: shown }) ?? shown}
</p>
