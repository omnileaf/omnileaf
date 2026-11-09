<script lang="ts">
  import FileQuestion from "@lucide/svelte/icons/file-question-mark";

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
</script>

<Empty>
  <EmptyMedia icon={FileQuestion} />
  <EmptyTitle>{copy.report.notFound}</EmptyTitle>
  <EmptyDescription>{copy.report.notFoundHint}</EmptyDescription>
  <EmptyContent>
    <a
      href={resolve("/reports")}
      class={cn(buttonLook("outline", "default"), FOCUS_RING)}
    >
      {copy.report.viewAll}
    </a>
  </EmptyContent>
</Empty>
