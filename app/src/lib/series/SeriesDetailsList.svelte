<script lang="ts">
  import type { SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { roleName } from "./creator-role.ts";
  import CreatorNames from "./CreatorNames.svelte";
  import { creatorsByRole } from "./credits.ts";

  let {
    overview,
    ref = $bindable(),
  }: { overview: SeriesOverview; ref?: HTMLElement | undefined } = $props();

  const credits = $derived(creatorsByRole(overview.creators));
</script>

<dl
  bind:this={ref}
  tabindex="-1"
  class="grid grid-cols-details items-baseline gap-x-md gap-y-sm text-small outline-none"
>
  <dt class="text-muted">{m.series_detail_title()}</dt>
  <dd class="wrap-anywhere">{overview.title}</dd>
  {#each credits as { role, names } (role)}
    <dt class="text-muted">{roleName(role)}</dt>
    <dd class="wrap-anywhere">
      <CreatorNames {names} creators={overview.creators} from={overview.id} />
    </dd>
  {/each}
  {#if overview.format !== null}
    <dt class="text-muted">{m.series_detail_format()}</dt>
    <dd class="wrap-anywhere">{overview.format}</dd>
  {/if}
</dl>
