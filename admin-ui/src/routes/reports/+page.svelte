<script lang="ts">
  import { onDestroy } from "svelte";

  import { afterNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import ReportsView from "#lib/components/reports-view.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { copy } from "#lib/copy.ts";
  import { FilterSync } from "#lib/filter-sync.svelte.ts";
  import { documentTitle } from "#lib/page-title.ts";
  import { useReports } from "#lib/reports-store.svelte.ts";
  import { retryReports } from "#lib/retry-reports.ts";

  const reports = useReports();

  const sync = new FilterSync({
    readUrl: () => page.url.searchParams,
    navigation: { goto, resolve },
    report: (error) => {
      globalThis.reportError(error);
    },
  });

  afterNavigate(sync.adoptAfterNavigation);
  onDestroy(sync.dispose);
</script>

<svelte:head>
  <title>{documentTitle(copy.shell.reports)}</title>
</svelte:head>

<ReportsView
  load={reports.state}
  filter={sync.filter}
  onChange={sync.change}
  onRetry={() => {
    void retryReports(reports, focusPageHeadingInDocument);
  }}
/>
