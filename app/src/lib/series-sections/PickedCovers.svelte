<script lang="ts">
  import type { ComponentProps } from "svelte";

  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";

  import SectionCovers from "./SectionCovers.svelte";

  let {
    ...covers
  }: Omit<ComponentProps<typeof SectionCovers>, "selection"> = $props();

  const selection = new Selection<SeriesBook["id"]>();
</script>

<SectionCovers {...covers} {selection} />
