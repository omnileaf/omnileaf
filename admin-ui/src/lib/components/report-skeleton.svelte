<script lang="ts">
  import { Card, CardContent } from "#lib/components/ui/card/index.ts";
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { copy } from "#lib/copy.ts";
</script>

<Card aria-busy="true">
  <p role="status" class="sr-only">{copy.report.loading}</p>
  <CardContent class="grid grid-cols-2 gap-4 tablet:grid-cols-4">
    <Skeleton class="block-10 inline-24" />
    <Skeleton class="block-10 inline-16" />
    <Skeleton class="col-span-2 block-10 inline-40" />
  </CardContent>
</Card>
