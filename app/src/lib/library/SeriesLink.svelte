<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { resolve } from "$app/paths";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import PickableLink from "./PickableLink.svelte";
  import { seriesSelection } from "./series-selection";

  let {
    id,
    isOpenable = true,
    ...rest
  }: Omit<
    ComponentProps<typeof PickableLink<SeriesId>>,
    "href" | "selection"
  > & { isOpenable?: boolean } = $props();
</script>

{#if isOpenable}
  <PickableLink
    {...rest}
    {id}
    href={resolve("/(app)/series/[id]", { id })}
    selection={seriesSelection()}
    picksOnClick={currentPlatform() === "macos"}
  />
{:else}
  <div
    role="group"
    aria-disabled="true"
    aria-label={m.library_series_not_connected({ title: rest.title })}
    class={rest.class}
  >
    {@render rest.children()}
  </div>
{/if}
