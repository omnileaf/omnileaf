<script lang="ts">
  import { Search } from "@lucide/svelte";

  import { Empty, EmptyMedia, EmptyTitle } from "./index.ts";
</script>

<Empty>
  <EmptyMedia data-testid="art"
    ><Search size={24} aria-hidden="true" /></EmptyMedia
  >
  <EmptyTitle>No matches</EmptyTitle>
</Empty>
