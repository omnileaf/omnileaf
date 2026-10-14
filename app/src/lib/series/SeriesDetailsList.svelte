<script lang="ts">
  import type { SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { nameList, roleName } from "./creator-role.ts";
  import { creatorsByRole } from "./credits.ts";

  let {
    overview,
    ref = $bindable(),
  }: { overview: SeriesOverview; ref?: HTMLElement | undefined } = $props();

  const rows = $derived([
    { term: m.series_detail_title(), value: overview.title },
    ...creatorsByRole(overview.creators).map(({ role, names }) => ({
      term: roleName(role),
      value: nameList(names),
    })),
    ...(overview.format === null
      ? []
      : [{ term: m.series_detail_format(), value: overview.format }]),
  ]);
</script>

<dl
  bind:this={ref}
  tabindex="-1"
  class="grid grid-cols-details items-baseline gap-x-md gap-y-sm text-small outline-none"
>
  {#each rows as { term, value } (term)}
    <dt class="text-muted">{term}</dt>
    <dd class="wrap-anywhere">{value}</dd>
  {/each}
</dl>
