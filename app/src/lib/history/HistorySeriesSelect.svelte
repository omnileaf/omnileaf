<script lang="ts">
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import type { HistorySeries } from "#lib/ipc/bindings.ts";
  import { standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  type SeriesId = HistorySeries["id"];

  const EVERY_SERIES = "";

  let {
    series,
    chosen,
    usesStandIns,
    onChoose,
  }: {
    series: readonly HistorySeries[];
    chosen: SeriesId | undefined;
    usesStandIns: boolean;
    onChoose: (series: SeriesId | undefined) => void;
  } = $props();

  function nameOf({ id, title }: HistorySeries): string {
    return usesStandIns ? standInLook({ id, title, cover: null }).title : title;
  }

  function choose({
    currentTarget: { value },
  }: Event & { currentTarget: HTMLSelectElement }): void {
    onChoose(series.find(({ id }) => id === value)?.id);
  }
</script>

<NativeSelect
  aria-label={m.history_series_filter()}
  value={chosen ?? EVERY_SERIES}
  onchange={choose}
  class="hidden large:flex large:max-inline-history-series-filter"
>
  <option value={EVERY_SERIES}>{m.history_every_series()}</option>
  {#each series as shown (shown.id)}
    <option value={shown.id}>{nameOf(shown)}</option>
  {/each}
</NativeSelect>
