<script lang="ts">
  import type { SeriesDetails, SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { roleName } from "./creator-role.ts";
  import CreatorNames from "./CreatorNames.svelte";
  import { creatorsByRole } from "./credits.ts";
  import { sourceLine } from "./detail-source.ts";

  let {
    overview,
    sourced,
    ref = $bindable(),
  }: {
    overview: SeriesOverview;
    sourced?: SeriesDetails | undefined;
    ref?: HTMLElement | undefined;
  } = $props();

  const credits = $derived(creatorsByRole(overview.creators));
  const titleSource = $derived(
    sourced === undefined
      ? undefined
      : sourceLine(sourced.title.source, sourced.title.edited !== null),
  );
  const peopleSource = $derived(
    sourced === undefined
      ? undefined
      : sourceLine(
          sourced.people.fromFile.length > 0 ? "files" : null,
          sourced.people.edited !== null,
        ),
  );
  const year = $derived(sourced?.year ?? null);
</script>

<dl
  bind:this={ref}
  tabindex="-1"
  class="grid grid-cols-details items-baseline gap-x-md gap-y-sm text-small outline-none"
>
  <dt class="text-muted">{m.series_detail_title()}</dt>
  <dd class="wrap-anywhere">
    {overview.title}
    {#if titleSource !== undefined}
      <span class="block text-caption text-muted">{titleSource}</span>
    {/if}
  </dd>
  {#each credits as { role, names } (role)}
    <dt class="text-muted">{roleName(role)}</dt>
    <dd class="wrap-anywhere">
      <CreatorNames {names} creators={overview.creators} from={overview.id} />
      {#if peopleSource !== undefined}
        <span class="block text-caption text-muted">{peopleSource}</span>
      {/if}
    </dd>
  {/each}
  {#if year !== null}
    <dt class="text-muted">{m.series_detail_year()}</dt>
    <dd>
      {year.fromFile}
      <span class="block text-caption text-muted"
        >{sourceLine(year.source, false)}</span
      >
    </dd>
  {/if}
  {#if overview.format !== null}
    <dt class="text-muted">{m.series_detail_format()}</dt>
    <dd class="wrap-anywhere">{overview.format}</dd>
  {/if}
</dl>
