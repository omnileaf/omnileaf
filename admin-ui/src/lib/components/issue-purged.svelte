<script lang="ts">
  import Lock from "@lucide/svelte/icons/lock";

  import { resolve } from "$app/paths";

  import { cn } from "#lib/cn.ts";
  import { buttonLook } from "#lib/components/ui/button/variants.ts";
  import { FOCUS_RING } from "#lib/components/ui/controls.ts";
  import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { copy } from "#lib/copy.ts";
  import { pathSegment } from "#lib/path-segment.ts";

  let { code }: { code: string } = $props();
</script>

<Empty>
  <EmptyMedia icon={Lock} />
  <EmptyTitle>{copy.issue.purgedTitle}</EmptyTitle>
  <EmptyDescription>{copy.issue.purgedHint}</EmptyDescription>
  <EmptyContent>
    <a
      href={resolve("/reports/[code]", { code: pathSegment(code) })}
      class={cn(buttonLook("outline", "default"), FOCUS_RING)}
    >
      {copy.issue.backToReport}
    </a>
  </EmptyContent>
</Empty>
