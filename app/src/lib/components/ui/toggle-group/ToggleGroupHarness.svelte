<script lang="ts">
  import { ToggleGroup, ToggleGroupItem } from "./index.ts";

  let shown = $state("grid");
</script>

<ToggleGroup bind:value={shown} aria-label="Show">
  <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
  <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
  <ToggleGroupItem value="list">List</ToggleGroupItem>
</ToggleGroup>
