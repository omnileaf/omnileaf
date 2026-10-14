<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import type { ReadTo } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const FINISHED_ICON_SIZE = 12;

  let { readTo, bar }: { readTo: ReadTo; bar: ClassValue } = $props();

  const reached = $derived(
    readTo.state === "page"
      ? { page: readTo.page, count: readTo.pageCount }
      : undefined,
  );
</script>

{#if reached === undefined}
  <Badge look="condition" class="px-sm text-caption font-bold text-accent">
    <Check size={FINISHED_ICON_SIZE} aria-hidden="true" />
    {m.history_finished()}
  </Badge>
{:else}
  <Progress
    aria-label={m.history_page_of(reached)}
    max={reached.count}
    value={reached.page}
    class={["block-progress-compact", bar]}
  />
  <span aria-hidden="true" class="font-semibold whitespace-nowrap">
    {m.history_pages(reached)}
  </span>
{/if}
