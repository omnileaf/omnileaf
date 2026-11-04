<script lang="ts">
  import ReportAudit from "#lib/components/report-audit.svelte";
  import ReportCrumb from "#lib/components/report-crumb.svelte";
  import ReportError from "#lib/components/report-error.svelte";
  import ReportFacts from "#lib/components/report-facts.svelte";
  import ReportHeader from "#lib/components/report-header.svelte";
  import ReportNotFound from "#lib/components/report-not-found.svelte";
  import ReportSkeleton from "#lib/components/report-skeleton.svelte";
  import ReportText from "#lib/components/report-text.svelte";
  import type { ReportState } from "#lib/report-store.svelte.ts";

  let {
    code,
    load,
    onRetry,
  }: { code: string; load: ReportState; onRetry: () => void } = $props();
</script>

<ReportCrumb />
<ReportHeader
  {code}
  status={load.kind === "ready" ? load.detail.listed.status : undefined}
/>

{#if load.kind === "loading"}
  <ReportSkeleton />
{:else if load.kind === "notFound"}
  <ReportNotFound />
{:else if load.kind === "failed"}
  <ReportError message={load.message} {onRetry} />
{:else if load.kind === "ready"}
  <ReportFacts report={load.detail.listed} />
  <div class="mbs-4 grid gap-4 tablet:mbs-6 tablet:gap-6">
    <ReportText text={load.detail.report} />
    <ReportAudit entries={load.detail.audit} />
  </div>
{/if}
