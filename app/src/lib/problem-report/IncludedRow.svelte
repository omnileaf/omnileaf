<script lang="ts">
  import type { Component, Snippet } from "svelte";

  import CardIncludedSummary from "./CardIncludedSummary.svelte";
  import FlushIncludedSummary from "./FlushIncludedSummary.svelte";
  import type { IncludedSummaryProps } from "./report-row-props.ts";
  import {
    CurrentReportRowsLook,
    type ReportRowsLook,
  } from "./report-rows-look.ts";

  const SUMMARIES = {
    flush: FlushIncludedSummary,
    card: CardIncludedSummary,
  } satisfies Record<ReportRowsLook, Component<IncludedSummaryProps>>;

  let { children, ...summary }: IncludedSummaryProps & { children?: Snippet } =
    $props();

  const rowsLook = new CurrentReportRowsLook();
  const Summary = $derived(SUMMARIES[rowsLook.current]);
</script>

<li class="flex flex-col">
  <Summary {...summary} />
  {@render children?.()}
</li>
