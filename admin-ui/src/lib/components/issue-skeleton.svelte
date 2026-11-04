<script lang="ts">
  import { Card, CardContent } from "#lib/components/ui/card/index.ts";
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { copy } from "#lib/copy.ts";
</script>

<Card aria-busy="true">
  <p role="status" class="sr-only">{copy.issue.loading}</p>
  <CardContent class="grid gap-4">
    <Skeleton class="block-4 inline-32" />
    <Skeleton class="block-48 inline-full" />
    <Skeleton class="block-10 inline-28" />
  </CardContent>
</Card>
