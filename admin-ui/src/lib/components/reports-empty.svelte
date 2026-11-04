<script lang="ts">
  import Inbox from "@lucide/svelte/icons/inbox";

  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { copy } from "#lib/copy.ts";
</script>

<Empty>
  <EmptyMedia icon={Inbox} />
  <EmptyTitle>{copy.reports.none}</EmptyTitle>
  <EmptyDescription>{copy.reports.noneHint}</EmptyDescription>
</Empty>
