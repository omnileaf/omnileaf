<script lang="ts">
  import { resolve } from "$app/paths";

  import SectionCovers from "./SectionCovers.svelte";
  import type { SectionTile } from "./section-tiles";

  let {
    tiles,
    width,
    usesStandIns = false,
  }: {
    tiles: readonly SectionTile[];
    width: number;
    usesStandIns?: boolean;
  } = $props();
</script>

<div style:inline-size="{width}px">
  <SectionCovers
    {tiles}
    label="Volumes"
    isComplete
    onNearEnd={() => undefined}
    {usesStandIns}
    volumePage={(volume) =>
      resolve("/(app)/series/[id]/volume/[volume]", {
        id: "harness",
        volume: String(volume),
      })}
    selection={undefined}
  />
</div>
