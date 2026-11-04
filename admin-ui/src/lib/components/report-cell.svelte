<script lang="ts">
  import ReceivedTime from "#lib/components/received-time.svelte";
  import type { ReportColumn } from "#lib/report-columns.ts";
  import type { Listed } from "#lib/wire.ts";

  let { report, column }: { report: Listed; column: ReportColumn } = $props();
</script>

{#if column === "platform"}
  {report.platform}
{:else if column === "version"}
  <span class="tabular-nums">{report.version}</span>
{:else}
  <ReceivedTime at={report.receivedAt} />
{/if}
