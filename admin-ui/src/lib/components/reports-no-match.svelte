<script lang="ts">
  import SearchX from "@lucide/svelte/icons/search-x";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { copy } from "#lib/copy.ts";

  let { onClear }: { onClear: () => void } = $props();
</script>

<Empty>
  <EmptyMedia icon={SearchX} />
  <EmptyTitle>{copy.reports.noMatch}</EmptyTitle>
  <EmptyDescription>{copy.reports.noMatchHint}</EmptyDescription>
  <EmptyContent>
    <Button variant="outline" onclick={onClear}>
      {copy.reports.clearFilters}
    </Button>
  </EmptyContent>
</Empty>
