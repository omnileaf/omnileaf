<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";

  import { progressOf, progressWords } from "./book-reading";
  import { ROW_PROGRESS } from "./row-progress";

  let { book, class: className }: { book: SeriesBook; class?: string } =
    $props();

  const progress = $derived(progressOf(book));
</script>

{#if progress !== undefined}
  <Progress
    aria-label={progressWords(book)}
    max={progress.pages}
    value={progress.page}
    class={cn(ROW_PROGRESS, className)}
  />
{/if}
