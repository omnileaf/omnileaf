<script lang="ts">
  import SeriesBar from "./SeriesBar.svelte";

  let { isTitleUnderBar }: { isTitleUnderBar: boolean } = $props();
</script>

<main>
  <SeriesBar
    title="Sample Series 04"
    {isTitleUnderBar}
    onMarkAll={() => Promise.resolve()}
    onLabel={undefined}
    onEditDetails={undefined}
    showFolder={{ label: "Show folder", onShow: undefined }}
  />
</main>
