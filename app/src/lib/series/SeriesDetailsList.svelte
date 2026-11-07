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

  const ROW =
    "contents android:max-medium:flex android:max-medium:flex-col android:max-medium:justify-center android:max-medium:py-native-row-block android:max-medium:ps-native-row-start android:max-medium:pe-native-row-end android:max-medium:min-block-native-row-two";
  const TERM =
    "text-muted android:max-medium:text-native-row-title/native-row-title android:max-medium:font-native-row-title android:max-medium:tracking-native-row-title android:max-medium:text-foreground";
  const VALUE =
    "android:max-medium:text-native-row-subtitle/native-row-subtitle android:max-medium:tracking-native-row-subtitle android:max-medium:text-muted";
</script>

<dl
  bind:this={ref}
  tabindex="-1"
  class="grid grid-cols-details items-baseline gap-x-md gap-y-sm text-small outline-none android:max-medium:flex android:max-medium:flex-col android:max-medium:gap-none"
>
  <div class={ROW}>
    <dt class={TERM}>{m.series_detail_title()}</dt>
    <dd class={["wrap-anywhere", VALUE]}>
      {overview.title}
      {#if titleSource !== undefined}
        <span class="block text-caption text-muted">{titleSource}</span>
      {/if}
    </dd>
  </div>
  {#each credits as { role, names } (role)}
    <div class={ROW}>
      <dt class={TERM}>{roleName(role)}</dt>
      <dd class={["wrap-anywhere", VALUE]}>
        <CreatorNames {names} creators={overview.creators} from={overview.id} />
        {#if peopleSource !== undefined}
          <span class="block text-caption text-muted">{peopleSource}</span>
        {/if}
      </dd>
    </div>
  {/each}
  {#if year !== null}
    <div class={ROW}>
      <dt class={TERM}>{m.series_detail_year()}</dt>
      <dd class={VALUE}>
        {year.fromFile}
        <span class="block text-caption text-muted"
          >{sourceLine(year.source, false)}</span
        >
      </dd>
    </div>
  {/if}
  {#if overview.format !== null}
    <div class={ROW}>
      <dt class={TERM}>{m.series_detail_format()}</dt>
      <dd class={["wrap-anywhere", VALUE]}>{overview.format}</dd>
    </div>
  {/if}
</dl>
