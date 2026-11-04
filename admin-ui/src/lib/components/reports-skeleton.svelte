<script lang="ts">
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { copy } from "#lib/copy.ts";

  const ROWS = ["a", "b", "c", "d", "e"];
</script>

<Card class="gap-0 py-0" aria-busy="true">
  <p role="status" class="px-4 pbs-3 text-small text-muted tablet:px-5">
    {copy.reports.loading}
  </p>
  {#each ROWS as row (row)}
    <div
      class="flex items-center gap-4 border-be border-border p-4 last:border-0 tablet:px-5"
    >
      <Skeleton class="block-4 inline-28" />
      <Skeleton class="rounded-full block-5 inline-20" />
      <Skeleton class="block-4 inline-16" />
      <Skeleton class="block-4 inline-12" />
    </div>
  {/each}
</Card>
