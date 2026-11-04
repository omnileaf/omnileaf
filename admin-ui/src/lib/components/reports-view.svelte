<script lang="ts">
  import PageHead from "#lib/components/page-head.svelte";
  import ReportFilters from "#lib/components/report-filters.svelte";
  import ReportRows from "#lib/components/report-rows.svelte";
  import ReportsEmpty from "#lib/components/reports-empty.svelte";
  import ReportsError from "#lib/components/reports-error.svelte";
  import ReportsNoMatch from "#lib/components/reports-no-match.svelte";
  import ReportsSkeleton from "#lib/components/reports-skeleton.svelte";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { copy } from "#lib/copy.ts";
  import { filterOptions } from "#lib/filter-options.ts";
  import type { ReportColumn } from "#lib/report-columns.ts";
  import type { ReportsState } from "#lib/reports-store.svelte.ts";
  import {
    filterReports,
    isFiltering,
    type ReportFilter,
  } from "#lib/reports.ts";
  import { resultsSummary } from "#lib/results-summary.ts";

  let {
    load,
    filter,
    onChange,
    onRetry,
  }: {
    load: ReportsState;
    filter: ReportFilter;
    onChange: (next: ReportFilter) => void;
    onRetry: () => void;
  } = $props();

  const COLUMNS: readonly ReportColumn[] = [
    "status",
    "platform",
    "version",
    "received",
  ];

  const reports = $derived(load.kind === "ready" ? load.reports : []);
  const matches = $derived(filterReports(reports, filter));
  const options = $derived(filterOptions(reports, filter));
  const filtering = $derived(isFiltering(filter));
  const canClear = $derived(
    filtering && (load.kind !== "ready" || matches.length > 0),
  );

  function clear(): void {
    onChange({});
  }
</script>

<PageHead
  title={copy.shell.reports}
  subtitle={{ tablet: copy.reports.subtitle }}
/>

{#if load.kind === "ready" && load.reports.length === 0}
  <ReportsEmpty />
{:else}
  <ReportFilters
    {filter}
    {options}
    {onChange}
    onClear={canClear ? clear : undefined}
  />
  <div class="mbs-4">
    {#if load.kind === "loading"}
      <ReportsSkeleton />
    {:else if load.kind === "failed"}
      <ReportsError message={load.message} {onRetry} />
    {:else if load.kind === "ready"}
      <p aria-live="polite" class="mbe-3 text-small text-muted">
        {resultsSummary(
          matches.length,
          load.reports.length,
          load.truncated ? "newest" : "all",
        )}
      </p>
      {#if matches.length === 0}
        <ReportsNoMatch onClear={clear} />
      {:else}
        <Card class="gap-0 overflow-hidden py-0">
          <ReportRows reports={matches} columns={COLUMNS} />
        </Card>
      {/if}
    {/if}
  </div>
{/if}
