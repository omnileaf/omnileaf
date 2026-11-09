<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { copy } from "#lib/copy.ts";
  import { STATUS_KINDS } from "#lib/wire.ts";
</script>

<div aria-busy="true">
  <p role="status" class="mbe-3 text-small text-muted">
    {copy.reports.loading}
  </p>
  <div class="grid grid-cols-2 gap-3 tablet:grid-cols-5 tablet:gap-4">
    {#each STATUS_KINDS as kind (kind)}
      <Skeleton
        class="rounded-card block-24 last:col-span-2 tablet:last:col-span-1"
      />
    {/each}
  </div>
  <div class="mbs-4 grid gap-4 tablet:mbs-6 tablet:grid-cols-2 tablet:gap-6">
    <Skeleton class="rounded-card block-40" />
    <Skeleton class="rounded-card block-40" />
  </div>
  <Skeleton class="mbs-4 rounded-card block-48 tablet:mbs-6" />
</div>
