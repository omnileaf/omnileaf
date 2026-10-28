<script lang="ts">
  import type { BookSection } from "#lib/ipc/bindings.ts";

  import { type NotedSeries, sectionNote } from "./section-note";

  let { section, series }: { section: BookSection; series: NotedSeries } =
    $props();

  const note = $derived(sectionNote(section, series));
</script>

{#if note !== undefined}
  <p class="text-small text-muted">{note}</p>
{/if}
