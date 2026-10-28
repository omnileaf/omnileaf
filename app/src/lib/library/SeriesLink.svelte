<script lang="ts">
  import type { ComponentProps } from "svelte";

  import { resolve } from "$app/paths";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import PickableLink from "./PickableLink.svelte";
  import { seriesSelection } from "./series-selection";

  let {
    id,
    ...rest
  }: Omit<
    ComponentProps<typeof PickableLink<SeriesId>>,
    "href" | "selection"
  > = $props();
</script>

<PickableLink
  {...rest}
  {id}
  href={resolve("/(app)/series/[id]", { id })}
  selection={seriesSelection()}
/>
