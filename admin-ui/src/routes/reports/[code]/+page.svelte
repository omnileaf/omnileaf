<script lang="ts">
  import { page } from "$app/state";

  import ReportView from "#lib/components/report-view.svelte";
  import { focusPageHeadingInDocument } from "#lib/browser-focus.ts";
  import { api } from "#lib/browser-api.ts";
  import { documentTitle } from "#lib/page-title.ts";
  import { ReportStore } from "#lib/report-store.svelte.ts";
  import { refreshAndFocus } from "#lib/refresh-and-focus.ts";

  const code = $derived(page.params.code ?? "");
  const report = $derived(new ReportStore(api, code));

  $effect(() => {
    void report.reload();
  });
</script>

<svelte:head>
  <title>{documentTitle(code)}</title>
</svelte:head>

<ReportView
  {code}
  load={report.state}
  onRetry={() => {
    void refreshAndFocus(() => report.reload(), focusPageHeadingInDocument);
  }}
/>
