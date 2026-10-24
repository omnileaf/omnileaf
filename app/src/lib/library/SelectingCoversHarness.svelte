<script lang="ts">
  import { type ComponentProps, untrack } from "svelte";

  import type { Selection } from "#lib/page/selection.svelte.ts";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import { setSeriesSelection } from "./series-selection";
  import SeriesCovers from "./SeriesCovers.svelte";

  let {
    selection,
    ...covers
  }: { selection: Selection<SeriesId> } & ComponentProps<typeof SeriesCovers> =
    $props();

  setSeriesSelection(untrack(() => selection));
</script>

<SeriesCovers {...covers} />
