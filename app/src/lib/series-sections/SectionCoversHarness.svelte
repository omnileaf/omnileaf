<script lang="ts">
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
    selection={undefined}
  />
</div>
