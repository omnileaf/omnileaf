<script lang="ts">
  import DashboardView from "#lib/components/dashboard-view.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { copy } from "#lib/copy.ts";
  import { documentTitle } from "#lib/page-title.ts";
  import { useReports } from "#lib/reports-store.svelte.ts";
  import { retryReports } from "#lib/retry-reports.ts";

  const reports = useReports();
</script>

<svelte:head>
  <title>{documentTitle(copy.shell.dashboard)}</title>
</svelte:head>

<DashboardView
  load={reports.state}
  onRetry={() => {
    void retryReports(reports, focusPageHeadingInDocument);
  }}
/>
