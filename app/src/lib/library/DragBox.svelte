<script lang="ts">
  import type { Box } from "./drag-box";

  let { box }: { box: Box } = $props();
</script>

<div
  data-drag-box
  aria-hidden="true"
  class="pointer-events-none absolute z-drag-box rounded-drag-box border border-accent bg-drag-box"
  style:left="{box.left}px"
  style:top="{box.top}px"
  style:width="{box.width}px"
  style:height="{box.height}px"
></div>
